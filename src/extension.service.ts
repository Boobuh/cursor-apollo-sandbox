import { CursorBrowser } from "./browser";
import { BROWSER_TAB_HELP } from "./browser.types";
import { isBrowserViewError } from "./browser.utils";
import { resolveSandboxConfig } from "./apollo/graphql-url";
import {
  buildAutoDetectHeadersScript,
  buildPersistHeadersScript,
  mergeDetectedHeaders
} from "./apollo/header-detection";
import {
  buildFillSandboxScript,
  buildRunOperationScript,
  buildSandboxIframeUrl,
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
import { collectTargetHosts } from "./extension.helpers";
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
    sandboxWaitMs: cfg.get<number>("sandboxWaitMs") ?? 9000,
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
  targetUrl?: string
): Promise<HeaderDetectionResult | undefined> {
  try {
    return await browser.runInTab<HeaderDetectionResult>(detectScript, {
      hintViewId: tabViewId,
      targetUrl
    });
  } catch {
    return undefined;
  }
}

export async function autoDetectHeaders(
  browser: CursorBrowser,
  config: ResolvedSandboxConfig
): Promise<CapturedGraphqlAuth> {
  const detectScript = buildAutoDetectHeadersScript(
    config.graphqlUrl,
    config.graphqlUrlMatch,
    config.headerDetectMs
  );
  const hosts = collectTargetHosts(config);
  const parts: HeaderDetectionResult[] = [];
  const visitedHosts = new Set<string>();

  for (const tab of await browser.listTabs()) {
    if (!tab.viewId || !tab.url) continue;
    let host = "";
    try {
      host = new URL(tab.url).hostname;
    } catch {
      continue;
    }
    if (!hosts.has(host) || visitedHosts.has(host)) continue;
    visitedHosts.add(host);
    const result = await runDetectOnTab(
      browser,
      detectScript,
      tab.viewId,
      tab.url
    );
    if (result) parts.push(result);
  }

  for (const url of [config.authCaptureUrl.trim(), config.graphqlUrl].filter(
    Boolean
  )) {
    await browser.ensureBrowserTab(url);
    await browser.waitForLoad(1500);
    const result = await browser.runInTab<HeaderDetectionResult>(
      detectScript,
      { targetUrl: url }
    );
    if (result) parts.push(result);
  }

  const merged = mergeDetectedHeaders(...parts);

  await browser.ensureBrowserTab(config.graphqlUrl);
  await browser.runInTab(buildPersistHeadersScript(merged.headers, merged), {
    targetUrl: config.graphqlUrl
  });

  if (
    !merged.probeOk &&
    !Object.keys(merged.headers).length &&
    !merged.graphqlSeen
  ) {
    throw new Error(
      "Could not auto-detect GraphQL headers. Log into your app in the Cursor browser, trigger a GraphQL request, then retry."
    );
  }

  return merged;
}

export async function fillSandbox(
  browser: CursorBrowser,
  config: ResolvedSandboxConfig,
  auth: CapturedGraphqlAuth
): Promise<string[]> {
  await browser.ensureBrowserTab(config.graphqlUrl);

  const iframeUrl = buildSandboxIframeUrl(
    config.graphqlUrl,
    auth,
    config.defaultOperation,
    config.defaultVariablesJson
  );

  const result = await browser.runInTab<{
    ok?: boolean;
    err?: string;
    headerKeys?: string[];
  }>(buildFillSandboxScript(iframeUrl, config.sandboxWaitMs), {
    targetUrl: config.graphqlUrl
  });

  if (result?.err) {
    throw new Error(result.err);
  }

  return result?.headerKeys ?? Object.keys(auth.headers);
}

export async function runOperation(
  browser: CursorBrowser,
  config: ResolvedSandboxConfig
): Promise<{ data?: unknown; ms?: number }> {
  await browser.ensureBrowserTab(config.graphqlUrl);

  const result = await browser.runInTab<{
    err?: string;
    data?: unknown;
    ms?: number;
    errors?: string[];
  }>(
    buildRunOperationScript(
      config.graphqlUrl,
      config.defaultOperation,
      config.defaultVariablesJson
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
