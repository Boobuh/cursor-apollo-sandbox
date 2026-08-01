import { CursorBrowser } from "./browser";
import { BROWSER_TAB_HELP } from "./browser.types";
import { isBrowserViewError, findAuthCaptureTabsInContext } from "./browser.utils";
import { resolveSandboxConfig } from "./apollo/graphql-url";
import {
  buildAutoDetectHeadersScript,
  buildInstallPersistentTrafficHookScript,
  buildPersistHeadersScript,
  buildReadCachedGraphqlRequestScript,
  hasRealGraphqlOperation,
  hasRequiredGraphqlAuthHeaders,
  isTrafficHeaderSource,
  isTrivialProbeQuery,
  mergeTrafficCapture
} from "./apollo/header-detection";
import {
  buildFillSandboxScript,
  buildRunOperationScript,
  formatVariablesJson,
  FALLBACK_OPERATION,
  FALLBACK_VARIABLES_JSON,
  parseVariablesJson
} from "./apollo/sandbox";
import type {
  CapturedGraphqlAuth,
  HeaderDetectionResult,
  ResolvedSandboxConfig,
  SandboxConfig
} from "./apollo/sandbox.types";
import type { ExtensionHostApi } from "./extension.types";

export function getBaseConfig(api: ExtensionHostApi): SandboxConfig {
  const cfg = api.workspace.getConfiguration("apolloSandbox");
  const graphqlUrl =
    cfg.get<string>("graphqlUrl") ?? "http://localhost:4000/graphql";
  const defaultOperation =
    cfg.get<string>("defaultOperation")?.trim() || FALLBACK_OPERATION;
  const defaultVariablesRaw =
    cfg.get<string>("defaultVariables")?.trim() || FALLBACK_VARIABLES_JSON;

  try {
    parseVariablesJson(defaultVariablesRaw);
  } catch {
    /* defer invalid-config error until a command runs */
  }

  return {
    authCaptureUrl: cfg.get<string>("authCaptureUrl") ?? "",
    graphqlUrl,
    graphqlUrlFromBrowserTab:
      cfg.get<boolean>("graphqlUrlFromBrowserTab") ?? false,
    graphqlUrlMatch: cfg.get<string>("graphqlUrlMatch")?.trim() ?? "",
    sandboxWaitMs: cfg.get<number>("sandboxWaitMs") ?? 12000,
    headerDetectMs: cfg.get<number>("headerDetectMs") ?? 6000,
    defaultOperation,
    defaultVariablesJson: defaultVariablesRaw
  };
}

export async function getResolvedConfig(
  api: ExtensionHostApi,
  browser: CursorBrowser
): Promise<ResolvedSandboxConfig> {
  return resolveSandboxConfig(browser, getBaseConfig(api));
}

async function runDetectOnTab(
  browser: CursorBrowser,
  detectScript: string,
  tabViewId: string,
  tabUrl: string | undefined,
  config: ResolvedSandboxConfig,
  allowNonGraphqlTab: boolean
): Promise<HeaderDetectionResult | undefined> {
  try {
    return await browser.runInTab<HeaderDetectionResult>(detectScript, {
      hintViewId: tabViewId,
      targetUrl: config.graphqlUrl,
      authCaptureUrl: config.authCaptureUrl,
      allowNonGraphqlTab
    });
  } catch {
    return undefined;
  }
}

async function finalizeDetectedAuth(
  browser: CursorBrowser,
  config: ResolvedSandboxConfig,
  merged: CapturedGraphqlAuth
): Promise<CapturedGraphqlAuth> {
  await browser.runInTab(buildPersistHeadersScript(merged), {
    targetUrl: config.graphqlUrl,
    navigateToTargetUrl: true
  });

  if (!hasRequiredGraphqlAuthHeaders(merged.headers)) {
    merged.sources = [
      ...new Set([...(merged.sources ?? []), "traffic-partial-headers"])
    ];
  }

  return merged;
}

function pickBestTrafficPart(
  parts: HeaderDetectionResult[]
): HeaderDetectionResult | undefined {
  const trafficParts = parts.filter(
    (part) =>
      part.sources?.some(isTrafficHeaderSource) &&
      Object.keys(part.headers ?? {}).length
  );
  return [...trafficParts].sort((a, b) => {
    const score = (part: HeaderDetectionResult): number => {
      let value = Object.keys(part.headers ?? {}).length * 10;
      if (part.probeOk) value += 100;
      if (hasRequiredGraphqlAuthHeaders(part.headers ?? {})) value += 200;
      if (part.operation && !isTrivialProbeQuery(part.operation)) value += 150;
      return value;
    };
    return score(b) - score(a);
  })[0];
}

export function resolveSandboxDocument(
  auth: CapturedGraphqlAuth,
  config: ResolvedSandboxConfig
): string {
  const captured = auth.operation?.trim();
  if (captured && !isTrivialProbeQuery(captured)) {
    return captured;
  }
  return config.defaultOperation;
}

export function resolveSandboxVariablesJson(
  auth: CapturedGraphqlAuth,
  config: ResolvedSandboxConfig
): string {
  if (auth.operation?.trim() && !isTrivialProbeQuery(auth.operation)) {
    return formatVariablesJson(auth.variablesJson?.trim() || "{}");
  }
  return formatVariablesJson(config.defaultVariablesJson);
}

async function readCachedFromAppTabs(
  browser: CursorBrowser,
  appTabs: Awaited<ReturnType<CursorBrowser["getEnrichedTabContext"]>>["tabs"],
  cacheScript: string,
  config: ResolvedSandboxConfig
): Promise<HeaderDetectionResult[]> {
  const cachedParts: HeaderDetectionResult[] = [];
  const tabs = appTabs.length
    ? appTabs
    : [{ viewId: undefined as string | undefined }];

  for (const tab of tabs) {
    const cached = await browser.runInTab<HeaderDetectionResult | null>(
      cacheScript,
      {
        hintViewId: tab.viewId,
        allowNonGraphqlTab: true,
        targetUrl: config.graphqlUrl,
        authCaptureUrl: config.authCaptureUrl
      }
    );
    if (cached) cachedParts.push(cached);
  }
  return cachedParts;
}

const OPERATION_SEARCH_PASSES = 3;
const OPERATION_SEARCH_PASS_DELAY_MS = 700;

/** @internal test hook for detect failure branches */
export function throwDetectFailure(parts: HeaderDetectionResult[]): never {
  const merged = mergeTrafficCapture(...parts);

  if (!Object.keys(merged.headers).length) {
    throw new Error(
      "Could not capture headers from GraphQL network traffic. Focus a logged-in tab with at least one graphql POST in Network, then retry Setup."
    );
  }

  if (!hasRealGraphqlOperation(merged)) {
    throw new Error(
      "Could not capture a GraphQL operation from network traffic. Focus a logged-in app tab, trigger an action that sends a graphql POST (not only __typename), then retry Setup."
    );
  }

  throw new Error(
    "Could not finalize captured GraphQL auth. Retry Setup with a logged-in app tab open."
  );
}

export async function autoDetectHeaders(
  browser: CursorBrowser,
  config: ResolvedSandboxConfig
): Promise<CapturedGraphqlAuth> {
  const hookScript = buildInstallPersistentTrafficHookScript();
  const detectScript = buildAutoDetectHeadersScript(
    config.graphqlUrl,
    config.graphqlUrlMatch,
    config.headerDetectMs
  );
  const cacheScript = buildReadCachedGraphqlRequestScript();
  const ctx = await browser.getEnrichedTabContext();
  const parts: HeaderDetectionResult[] = [];

  const appTabs = findAuthCaptureTabsInContext(
    ctx,
    config.graphqlUrl,
    config.authCaptureUrl
  );

  for (const tab of appTabs) {
    await browser.runInTab(hookScript, {
      hintViewId: tab.viewId,
      allowNonGraphqlTab: true,
      targetUrl: config.graphqlUrl,
      authCaptureUrl: config.authCaptureUrl
    });
  }

  if (!appTabs.length) {
    await browser.runInTab(hookScript, {
      allowNonGraphqlTab: true,
      targetUrl: config.graphqlUrl,
      authCaptureUrl: config.authCaptureUrl
    });
  }

  parts.push(...(await readCachedFromAppTabs(browser, appTabs, cacheScript, config)));

  for (let pass = 0; pass < OPERATION_SEARCH_PASSES; pass += 1) {
    for (const tab of appTabs) {
      const result = await runDetectOnTab(
        browser,
        detectScript,
        tab.viewId,
        tab.url,
        config,
        true
      );
      if (result) parts.push(result);
    }

    if (!appTabs.length || !pickBestTrafficPart(parts)) {
      const result = await browser.runInTab<HeaderDetectionResult>(detectScript, {
        targetUrl: config.graphqlUrl,
        authCaptureUrl: config.authCaptureUrl,
        allowNonGraphqlTab: true
      });
      if (result) parts.push(result);
    }

    parts.push(...(await readCachedFromAppTabs(browser, appTabs, cacheScript, config)));

    const merged = mergeTrafficCapture(...parts);
    if (
      hasRealGraphqlOperation(merged) &&
      Object.keys(merged.headers).length > 0
    ) {
      return finalizeDetectedAuth(browser, config, merged);
    }

    if (pass < OPERATION_SEARCH_PASSES - 1) {
      await browser.waitForLoad(OPERATION_SEARCH_PASS_DELAY_MS);
    }
  }

  throwDetectFailure(parts);
}

export async function fillSandbox(
  browser: CursorBrowser,
  config: ResolvedSandboxConfig,
  auth: CapturedGraphqlAuth
): Promise<string[]> {
  const operation = resolveSandboxDocument(auth, config);
  const variablesJson = resolveSandboxVariablesJson(auth, config);

  const result = await browser.runInTab<{
    ok?: boolean;
    err?: string;
    headerKeys?: string[];
    operationFilled?: boolean;
    variablesFilled?: boolean;
  }>(
    buildFillSandboxScript(
      config.graphqlUrl,
      operation,
      variablesJson,
      config.sandboxWaitMs
    ),
    {
      targetUrl: config.graphqlUrl,
      navigateToTargetUrl: true
    }
  );

  if (result?.err) {
    throw new Error(result.err);
  }

  return result?.headerKeys ?? Object.keys(auth.headers);
}

export async function runOperation(
  browser: CursorBrowser,
  config: ResolvedSandboxConfig,
  auth?: CapturedGraphqlAuth
): Promise<{ data?: unknown; ms?: number }> {
  const operation = auth
    ? resolveSandboxDocument(auth, config)
    : config.defaultOperation;
  const variablesJson = auth
    ? resolveSandboxVariablesJson(auth, config)
    : config.defaultVariablesJson;
  const result = await browser.runInTab<{
    err?: string;
    data?: unknown;
    ms?: number;
    errors?: string[];
  }>(
    buildRunOperationScript(
      config.graphqlUrl,
      operation,
      variablesJson
    ),
    { targetUrl: config.graphqlUrl }
  );

  if (!result) {
    throw new Error("No response from browser");
  }
  if (result.err) {
    throw new Error(result.err);
  }
  if (result.errors?.length) {
    throw new Error(result.errors.join("; "));
  }

  return { data: result.data, ms: result.ms };
}

export async function runApolloCommand(
  api: ExtensionHostApi,
  title: string,
  fn: () => Promise<void>
): Promise<void> {
  try {
    await api.window.withProgress(
      { location: api.ProgressLocation.Notification, title },
      fn
    );
  } catch (err) {
    if (isBrowserViewError(err)) {
      api.window.showErrorMessage(
        `Apollo Sandbox: Cursor browser tab issue. ${BROWSER_TAB_HELP}`
      );
      return;
    }
    throw err;
  }
}
