import * as vscode from "vscode";
import { CursorBrowser, ensureBrowserTab } from "./browser";
import {
  buildCaptureAuthScript,
  buildFillSandboxScript,
  buildRunOperationScript,
  buildSandboxIframeUrl,
  deriveGraphqlUrlMatch,
  FALLBACK_OPERATION,
  FALLBACK_VARIABLES_JSON,
  parseVariablesJson
} from "./apollo/sandbox";
import type { CapturedGraphqlAuth, SandboxConfig } from "./apollo/sandbox.types";

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
    defaultOperation,
    defaultVariablesJson: defaultVariablesRaw
  };
}

function authCaptureTarget(config: SandboxConfig): string {
  return config.authCaptureUrl.trim() || config.graphqlUrl;
}

async function captureAuth(
  browser: CursorBrowser,
  viewId?: string
): Promise<CapturedGraphqlAuth> {
  const config = getConfig();
  const targetUrl = authCaptureTarget(config);
  const tabId = await ensureBrowserTab(browser, targetUrl, viewId);
  await browser.waitForLoad(2000);

  const auth = await browser.executeJavaScript<CapturedGraphqlAuth | null>(
    buildCaptureAuthScript(
      config.graphqlUrlMatch,
      config.sandboxWaitMs
    ),
    tabId
  );

  if (!auth?.graphqlSeen && !Object.keys(auth?.headers ?? {}).length) {
    throw new Error(
      "No GraphQL traffic captured. Open a logged-in app page that calls your API, interact with it, then retry."
    );
  }

  return {
    headers: auth?.headers ?? {},
    graphqlSeen: auth?.graphqlSeen
  };
}

async function fillSandbox(
  browser: CursorBrowser,
  viewId?: string
): Promise<void> {
  const config = getConfig();
  const tabId = await ensureBrowserTab(browser, config.graphqlUrl, viewId);

  const auth = await browser.executeJavaScript<CapturedGraphqlAuth | null>(
    `JSON.parse(sessionStorage.getItem('__apolloAuth')||'{"headers":{}}')`,
    tabId
  );

  const iframeUrl = buildSandboxIframeUrl(
    config.graphqlUrl,
    { headers: auth?.headers ?? {} },
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
  if (!keys.length) {
    return auth.graphqlSeen
      ? "Captured GraphQL session (cookie auth — no extra headers)."
      : "Captured GraphQL session.";
  }
  const authKey = keys.find((k) => /^authorization$/i.test(k));
  if (authKey) {
    return `Captured ${keys.length} header(s) including Authorization.`;
  }
  return `Captured ${keys.length} header(s): ${keys.slice(0, 4).join(", ")}${keys.length > 4 ? "…" : ""}`;
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
          title: "Apollo Sandbox: capturing GraphQL headers…"
        },
        async () => {
          const auth = await captureAuth(browser);
          vscode.window.showInformationMessage(headerSummary(auth));
        }
      );
    }),

    vscode.commands.registerCommand("apolloSandbox.fillSandbox", async () => {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Apollo Sandbox: filling operation, variables, headers…"
        },
        async () => {
          await fillSandbox(browser);
          vscode.window.showInformationMessage(
            "Apollo Sandbox filled (formatted operation, variables, headers)."
          );
        }
      );
    }),

    vscode.commands.registerCommand("apolloSandbox.runOperation", async () => {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Apollo Sandbox: running operation…"
        },
        async () => {
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
          title: "Apollo Sandbox: setup…"
        },
        async () => {
          await captureAuth(browser);
          await fillSandbox(browser);
          vscode.window.showInformationMessage(
            "Apollo Sandbox ready — operation, variables, and headers applied."
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
