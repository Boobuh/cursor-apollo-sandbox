import * as vscode from "vscode";
import { CursorBrowser, ensureBrowserTab } from "./browser";
import {
  ApolloAuth,
  buildCaptureAuthScript,
  buildFillSandboxScript,
  buildRunOperationScript,
  buildSandboxIframeUrl
} from "./apollo/export-template";

function getConfig() {
  const cfg = vscode.workspace.getConfiguration("apolloSandbox");
  return {
    catalogUrl: cfg.get<string>("catalogUrl") ?? "",
    graphqlUrl: cfg.get<string>("graphqlUrl") ?? "http://localhost:4000/graphql",
    sandboxWaitMs: cfg.get<number>("sandboxWaitMs") ?? 9000
  };
}

async function captureAuth(
  browser: CursorBrowser,
  viewId?: string
): Promise<ApolloAuth> {
  const { catalogUrl } = getConfig();
  if (!catalogUrl.trim()) {
    throw new Error(
      "Set apolloSandbox.catalogUrl in Settings (page that triggers /graphql while logged in)."
    );
  }

  const tabId = await ensureBrowserTab(browser, catalogUrl, viewId);
  await browser.waitForLoad(2000);

  const auth = await browser.executeJavaScript<ApolloAuth | null>(
    buildCaptureAuthScript(),
    tabId
  );

  if (!auth?.authorization) {
    throw new Error(
      "No Bearer token captured. Log into your app in the Cursor browser tab, then retry."
    );
  }

  return auth;
}

async function fillSandbox(
  browser: CursorBrowser,
  viewId?: string
): Promise<void> {
  const { graphqlUrl, sandboxWaitMs } = getConfig();
  const tabId = await ensureBrowserTab(browser, graphqlUrl, viewId);

  const auth = await browser.executeJavaScript<ApolloAuth | null>(
    `JSON.parse(sessionStorage.getItem('__apolloAuth')||'null')`,
    tabId
  );

  if (!auth?.authorization) {
    throw new Error(
      'No auth in sessionStorage. Run "Capture Auth" first.'
    );
  }

  const iframeUrl = buildSandboxIframeUrl(graphqlUrl, auth);
  const result = await browser.executeJavaScript<{ ok?: boolean; err?: string }>(
    buildFillSandboxScript(iframeUrl, sandboxWaitMs),
    tabId
  );

  if (result?.err) {
    throw new Error(result.err);
  }
}

async function runOperation(
  browser: CursorBrowser,
  viewId?: string
): Promise<{ data?: unknown; ms?: number }> {
  const { graphqlUrl } = getConfig();
  const tabId = await ensureBrowserTab(browser, graphqlUrl, viewId);

  const result = await browser.executeJavaScript<{
    err?: string;
    data?: unknown;
    ms?: number;
    errors?: string[];
  }>(buildRunOperationScript(), tabId);

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
          title: "Apollo Sandbox: capturing auth…"
        },
        async () => {
          const auth = await captureAuth(browser);
          const companyHint = auth["x-company-id"]?.slice(0, 8);
          vscode.window.showInformationMessage(
            companyHint
              ? `Captured Bearer (company ${companyHint}…)`
              : "Captured Bearer token."
          );
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

    vscode.commands.registerCommand("apolloSandbox.runExport", async () => {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Apollo Sandbox: running operation…"
        },
        async () => {
          const { data, ms } = await runOperation(browser);
          const preview = data ? JSON.stringify(data).slice(0, 120) : "see Response panel";
          vscode.window.showInformationMessage(`OK (${ms}ms): ${preview}`);
        }
      );
    }),

    vscode.commands.registerCommand(
      "apolloSandbox.setupExportTemplate",
      async () => {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Apollo Sandbox: setup sandbox…"
          },
          async () => {
            await captureAuth(browser);
            await fillSandbox(browser);
            vscode.window.showInformationMessage(
              "Apollo Sandbox ready — default operation with auth headers."
            );
          }
        );
      }
    )
  );
}

export function deactivate(): void {}
