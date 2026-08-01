import type * as vscode from "vscode";
import { runSelfTestCommand } from "./e2e/run-on-activation";
import { CursorBrowser } from "./browser";
import { BROWSER_TAB_HELP } from "./browser.types";
import { isBrowserViewError } from "./browser.utils";
import { endpointHint, captureSummary } from "./extension.helpers";
import {
  autoDetectHeaders,
  fillSandbox,
  getResolvedConfig,
  runApolloCommand,
  runOperation
} from "./extension.service";
import type { ExtensionCommandDeps, ExtensionHostApi } from "./extension.types";

export const APOLLO_COMMAND_IDS = [
  "apolloSandbox.openGraphql",
  "apolloSandbox.newBrowserTab",
  "apolloSandbox.captureAuth",
  "apolloSandbox.fillSandbox",
  "apolloSandbox.runOperation",
  "apolloSandbox.setupSandbox",
  "apolloSandbox.runExport",
  "apolloSandbox.setupExportTemplate",
  "apolloSandbox.runSelfTest"
] as const;

const NEW_BROWSER_TAB_DEFAULT_URL = "about:blank";

export type ApolloCommandId = (typeof APOLLO_COMMAND_IDS)[number];

function formatCommandError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function showCommandError(api: ExtensionHostApi, err: unknown): void {
  if (isBrowserViewError(err)) {
    void api.window.showErrorMessage(
      `Apollo Sandbox: Cursor browser tab issue. ${BROWSER_TAB_HELP}`
    );
    return;
  }
  void api.window.showErrorMessage(`Apollo Sandbox: ${formatCommandError(err)}`);
}

/** Wrap command handlers so uncaught errors never escape the extension host. */
function safeCommand(
  api: ExtensionHostApi,
  fn: () => Promise<void>
): () => Promise<void> {
  return async () => {
    try {
      await fn();
    } catch (err) {
      showCommandError(api, err);
    }
  };
}

/** Register all Apollo Sandbox commands (testable with mocked host + browser). */
export function registerApolloSandboxCommands(
  context: vscode.ExtensionContext,
  deps: ExtensionCommandDeps
): void {
  const { api, browser } = deps;

  context.subscriptions.push(
    api.commands.registerCommand(
      "apolloSandbox.openGraphql",
      safeCommand(api, async () => {
        const config = await getResolvedConfig(api, browser);
        await browser.ensureBrowserTab(config.graphqlUrl, { createIfMissing: true });
        api.window.showInformationMessage(
          `Opened ${config.graphqlUrl}${endpointHint(config)}`
        );
      })
    ),

    api.commands.registerCommand(
      "apolloSandbox.newBrowserTab",
      safeCommand(api, async () => {
        const viewId = await browser.newTab(NEW_BROWSER_TAB_DEFAULT_URL);
        if (!viewId) {
          throw new Error(`Could not open Cursor browser tab. ${BROWSER_TAB_HELP}`);
        }
      })
    ),

    api.commands.registerCommand(
      "apolloSandbox.captureAuth",
      safeCommand(api, async () => {
        await runApolloCommand(
          api,
          "Apollo Sandbox: auto-detecting headers…",
          async () => {
            const config = await getResolvedConfig(api, browser);
            const auth = await autoDetectHeaders(browser, config);
            api.window.showInformationMessage(
              captureSummary(auth) + endpointHint(config)
            );
          }
        );
      })
    ),

    api.commands.registerCommand(
      "apolloSandbox.fillSandbox",
      safeCommand(api, async () => {
        await runApolloCommand(
          api,
          "Apollo Sandbox: detecting headers and filling…",
          async () => {
            const config = await getResolvedConfig(api, browser);
            const auth = await autoDetectHeaders(browser, config);
            await fillSandbox(browser, config, auth);
            api.window.showInformationMessage(
              `Sandbox filled. ${captureSummary(auth)}${endpointHint(config)}`
            );
          }
        );
      })
    ),

    api.commands.registerCommand(
      "apolloSandbox.runOperation",
      safeCommand(api, async () => {
        await runApolloCommand(
          api,
          "Apollo Sandbox: detecting headers and running…",
          async () => {
            const config = await getResolvedConfig(api, browser);
            const auth = await autoDetectHeaders(browser, config);
            const { data, ms } = await runOperation(browser, config, auth);
            const preview = data
              ? JSON.stringify(data).slice(0, 120)
              : "see Response panel";
            api.window.showInformationMessage(
              `OK (${ms}ms): ${preview}${endpointHint(config)}`
            );
          }
        );
      })
    ),

    api.commands.registerCommand(
      "apolloSandbox.setupSandbox",
      safeCommand(api, async () => {
        await runApolloCommand(api, "Apollo Sandbox: auto-detect, fill…", async () => {
          const config = await getResolvedConfig(api, browser);
          const auth = await autoDetectHeaders(browser, config);
          await fillSandbox(browser, config, auth);
          const { data, ms } = await runOperation(browser, config, auth);
          const preview = data
            ? JSON.stringify(data).slice(0, 120)
            : "see Response panel";
          api.window.showInformationMessage(
            `Apollo Sandbox ready (${ms ?? "?"}ms): ${preview}. ${captureSummary(auth)}${endpointHint(config)}`
          );
        });
      })
    ),

    api.commands.registerCommand(
      "apolloSandbox.runExport",
      safeCommand(api, async () => {
        await api.commands.executeCommand("apolloSandbox.runOperation");
      })
    ),

    api.commands.registerCommand(
      "apolloSandbox.setupExportTemplate",
      safeCommand(api, async () => {
        await api.commands.executeCommand("apolloSandbox.setupSandbox");
      })
    ),

    api.commands.registerCommand(
      "apolloSandbox.runSelfTest",
      safeCommand(api, async () => {
        await runSelfTestCommand(api);
      })
    )
  );
}

/** Build deps from real VS Code API (used by activate). */
export function createDefaultDeps(
  api: ExtensionHostApi
): ExtensionCommandDeps {
  return {
    api,
    browser: new CursorBrowser(api.commands)
  };
}
