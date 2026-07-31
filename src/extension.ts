import * as vscode from "vscode";
import { CursorBrowser, ensureBrowserTab } from "./browser";
import {
  buildAutoDetectHeadersScript,
  buildPersistHeadersScript,
  mergeDetectedHeaders
} from "./apollo/header-detection";
import {
  buildFillSandboxScript,
  buildRunOperationScript,
  buildSandboxIframeUrl,
  deriveGraphqlUrlMatch,
  FALLBACK_OPERATION,
  FALLBACK_VARIABLES_JSON,
  parseVariablesJson
} from "./apollo/sandbox";
import type {
  CapturedGraphqlAuth,
  HeaderDetectionResult,
  SandboxConfig
} from "./apollo/sandbox.types";

function getConfig(): SandboxConfig {
  const cfg = vscode.workspace.getConfiguration("apolloSandbox");
  const graphqlUrl =
    cfg.get<string>("graphqlUrl") ?? "http://localhost:4000/graphql";
  const defaultOperation =
    cfg.get<string>("defaultOperation")?.trim() || FALLBACK_OPERATION;
  const defaultVariablesRaw =
    cfg.get<string>("defaultVariables")?.trim() || FALLBACK_VARIABLES_JSON;

  parseVariablesJson(defaultVariablesRaw);

  return {
    authCaptureUrl: cfg.get<string>("authCaptureUrl") ?? "",
    graphqlUrl,
    graphqlUrlMatch:
      cfg.get<string>("graphqlUrlMatch")?.trim() ||
      deriveGraphqlUrlMatch(graphqlUrl),
    sandboxWaitMs: cfg.get<number>("sandboxWaitMs") ?? 9000,
    headerDetectMs: cfg.get<number>("headerDetectMs") ?? 6000,
    defaultOperation,
    defaultVariablesJson: defaultVariablesRaw
  };
}

function collectTargetHosts(config: SandboxConfig): Set<string> {
  const hosts = new Set<string>();
  for (const raw of [config.graphqlUrl, config.authCaptureUrl.trim()]) {
    if (!raw) continue;
    try {
      hosts.add(new URL(raw).hostname);
    } catch {
      /* ignore invalid URL */
    }
  }
  return hosts;
}

async function autoDetectHeaders(
  browser: CursorBrowser
): Promise<CapturedGraphqlAuth> {
  const config = getConfig();
  const detectScript = buildAutoDetectHeadersScript(
    config.graphqlUrl,
    config.graphqlUrlMatch,
    config.headerDetectMs
  );
  const hosts = collectTargetHosts(config);
  const parts: HeaderDetectionResult[] = [];
  const visitedTabs = new Set<string>();

  for (const tab of await browser.listTabs()) {
    if (!tab.viewId || !tab.url) continue;
    let host = "";
    try {
      host = new URL(tab.url).hostname;
    } catch {
      continue;
    }
    if (!hosts.has(host)) continue;
    visitedTabs.add(tab.viewId);
    const result = await browser.executeJavaScript<HeaderDetectionResult>(
      detectScript,
      tab.viewId
    );
    if (result) parts.push(result);
  }

  const urlsToOpen = [
    config.authCaptureUrl.trim(),
    config.graphqlUrl
  ].filter(Boolean);

  for (const url of urlsToOpen) {
    const tabId = await ensureBrowserTab(browser, url);
    if (visitedTabs.has(tabId)) continue;
    visitedTabs.add(tabId);
    await browser.waitForLoad(1500);
    const result = await browser.executeJavaScript<HeaderDetectionResult>(
      detectScript,
      tabId
    );
    if (result) parts.push(result);
  }

  const merged = mergeDetectedHeaders(...parts);

  const gqlTab = await ensureBrowserTab(browser, config.graphqlUrl);
  await browser.executeJavaScript(
    buildPersistHeadersScript(merged.headers, merged),
    gqlTab
  );

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

async function fillSandbox(
  browser: CursorBrowser,
  auth: CapturedGraphqlAuth,
  viewId?: string
): Promise<string[]> {
  const config = getConfig();
  const tabId = await ensureBrowserTab(browser, config.graphqlUrl, viewId);

  const iframeUrl = buildSandboxIframeUrl(
    config.graphqlUrl,
    auth,
    config.defaultOperation,
    config.defaultVariablesJson
  );

  const result = await browser.executeJavaScript<{
    ok?: boolean;
    err?: string;
    headerKeys?: string[];
  }>(buildFillSandboxScript(iframeUrl, config.sandboxWaitMs), tabId);

  if (result?.err) {
    throw new Error(result.err);
  }

  return result?.headerKeys ?? Object.keys(auth.headers);
}

async function runOperation(
  browser: CursorBrowser,
  viewId?: string
): Promise<{ data?: unknown; ms?: number }> {
  const config = getConfig();
  const tabId = await ensureBrowserTab(browser, config.graphqlUrl, viewId);

  const result = await browser.executeJavaScript<{
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
    tabId
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

function headerSummary(auth: CapturedGraphqlAuth): string {
  const keys = Object.keys(auth.headers);
  const sources = auth.sources?.length
    ? ` (${auth.sources.join(", ")})`
    : "";
  const verified = auth.probeOk ? " — probe OK" : "";

  if (!keys.length) {
    return auth.probeOk || auth.graphqlSeen
      ? `Using cookie session for GraphQL${sources}${verified}.`
      : `No extra headers detected${sources}.`;
  }

  return `Auto-detected ${keys.length} header(s): ${keys.join(", ")}${sources}${verified}.`;
}

export function activate(context: vscode.ExtensionContext): void {
  const browser = new CursorBrowser(vscode.commands);

  context.subscriptions.push(
    vscode.commands.registerCommand("apolloSandbox.openGraphql", async () => {
      const { graphqlUrl } = getConfig();
      await ensureBrowserTab(browser, graphqlUrl);
      vscode.window.showInformationMessage(`Opened ${graphqlUrl}`);
    }),

    vscode.commands.registerCommand("apolloSandbox.captureAuth", async () => {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Apollo Sandbox: auto-detecting headers…"
        },
        async () => {
          const auth = await autoDetectHeaders(browser);
          vscode.window.showInformationMessage(headerSummary(auth));
        }
      );
    }),

    vscode.commands.registerCommand("apolloSandbox.fillSandbox", async () => {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Apollo Sandbox: detecting headers and filling…"
        },
        async () => {
          const auth = await autoDetectHeaders(browser);
          await fillSandbox(browser, auth);
          vscode.window.showInformationMessage(
            `Sandbox filled. ${headerSummary(auth)}`
          );
        }
      );
    }),

    vscode.commands.registerCommand("apolloSandbox.runOperation", async () => {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Apollo Sandbox: detecting headers and running…"
        },
        async () => {
          await autoDetectHeaders(browser);
          const { data, ms } = await runOperation(browser);
          const preview = data
            ? JSON.stringify(data).slice(0, 120)
            : "see Response panel";
          vscode.window.showInformationMessage(`OK (${ms}ms): ${preview}`);
        }
      );
    }),

    vscode.commands.registerCommand("apolloSandbox.setupSandbox", async () => {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Apollo Sandbox: auto-detect, fill…"
        },
        async () => {
          const auth = await autoDetectHeaders(browser);
          await fillSandbox(browser, auth);
          vscode.window.showInformationMessage(
            `Apollo Sandbox ready. ${headerSummary(auth)}`
          );
        }
      );
    }),

    vscode.commands.registerCommand("apolloSandbox.runExport", async () => {
      await vscode.commands.executeCommand("apolloSandbox.runOperation");
    }),

    vscode.commands.registerCommand(
      "apolloSandbox.setupExportTemplate",
      async () => {
        await vscode.commands.executeCommand("apolloSandbox.setupSandbox");
      }
    )
  );
}

export function deactivate(): void {}
