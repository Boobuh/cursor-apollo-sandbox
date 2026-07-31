import * as vscode from "vscode";
import { CursorBrowser, ensureBrowserTab } from "./browser";
import {
  ApolloAuth,
  buildCaptureAuthScript,
  buildFillSandboxScript,
  buildRunExportScript,
  buildSandboxIframeUrl
} from "./apollo/export-template";

function getConfig() {
  const cfg = vscode.workspace.getConfiguration("apolloSandbox");
  return {
    lmsCatalogUrl: cfg.get<string>("lmsCatalogUrl")!,
    graphqlUrl: cfg.get<string>("graphqlUrl")!,
    sandboxWaitMs: cfg.get<number>("sandboxWaitMs") ?? 9000
  };
}

async function captureAuth(
  browser: CursorBrowser,
  viewId?: string
): Promise<ApolloAuth> {
  const { lmsCatalogUrl } = getConfig();
  const tabId = await ensureBrowserTab(browser, lmsCatalogUrl, viewId);
  await browser.waitForLoad(2000);

  const auth = await browser.executeJavaScript<ApolloAuth | null>(
    buildCaptureAuthScript(),
    tabId
  );

  if (!auth?.authorization) {
    throw new Error(
      "No Bearer token captured. Log into LMS in the Cursor browser tab, then retry."
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
      "No auth in sessionStorage. Run “Capture LMS Auth” first."
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

async function runExport(
  browser: CursorBrowser,
  viewId?: string
): Promise<{ urlPrefix?: string; ms?: number }> {
  const { graphqlUrl } = getConfig();
  const tabId = await ensureBrowserTab(browser, graphqlUrl, viewId);

  const result = await browser.executeJavaScript<{
    err?: string;
    hasUrl?: boolean;
    urlPrefix?: string;
    ms?: number;
    errors?: string[];
  }>(buildRunExportScript(), tabId);

  if (result?.err) {
    throw new Error(result.err);
  }
  if (result?.errors?.length) {
    throw new Error(result.errors.join("; "));
  }
  if (!result?.hasUrl) {
    throw new Error("Export did not return a URL");
  }

  return { urlPrefix: result.urlPrefix, ms: result.ms };
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
          title: "Apollo Sandbox: capturing LMS auth…"
        },
        async () => {
          const auth = await captureAuth(browser);
          vscode.window.showInformationMessage(
            `Captured Bearer for company ${auth["x-company-id"]?.slice(0, 8) ?? "?"}…`
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
          title: "Apollo Sandbox: running export…"
        },
        async () => {
          const { urlPrefix, ms } = await runExport(browser);
          vscode.window.showInformationMessage(
            `Export OK (${ms}ms): ${urlPrefix ?? "see browser Response panel"}`
          );
        }
      );
    }),

    vscode.commands.registerCommand(
      "apolloSandbox.setupExportTemplate",
      async () => {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Apollo Sandbox: setup export template…"
          },
          async () => {
            await captureAuth(browser);
            await fillSandbox(browser);
            vscode.window.showInformationMessage(
              "Apollo Sandbox ready — ExportImportTemplate with auth headers."
            );
          }
        );
      }
    )
  );
}

export function deactivate(): void {}
