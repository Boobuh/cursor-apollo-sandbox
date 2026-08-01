import type * as vscode from "vscode";
import { maybeRunE2EOnActivation, runSelfTestCommand } from "./e2e/run-on-activation";
import { CursorBrowser } from "./browser";
import { BROWSER_TAB_HELP } from "./browser.types";
import { isBrowserViewError } from "./browser.utils";
import { endpointHint, headerSummary } from "./extension.helpers";
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
  "apolloSandbox.captureAuth",
  "apolloSandbox.fillSandbox",
  "apolloSandbox.runOperation",
  "apolloSandbox.setupSandbox",
  "apolloSandbox.runExport",
  "apolloSandbox.setupExportTemplate",
  "apolloSandbox.runSelfTest"
] as const;

export type ApolloCommandId = (typeof APOLLO_COMMAND_IDS)[number];

/** Register all Apollo Sandbox commands (testable with mocked host + browser). */
export function registerApolloSandboxCommands(
  context: vscode.ExtensionContext,
  deps: ExtensionCommandDeps
): void {
  const { api, browser } = deps;
  const extensionPath = context.extensionPath;

  context.subscriptions.push(
    api.commands.registerCommand("apolloSandbox.openGraphql", async () => {
      try {
        const config = await getResolvedConfig(api, browser);
        await browser.ensureBrowserTab(config.graphqlUrl);
        api.window.showInformationMessage(
          `Opened ${config.graphqlUrl}${endpointHint(config)}`
        );
      } catch (err) {
        if (isBrowserViewError(err)) {
          api.window.showErrorMessage(
            `Apollo Sandbox: Cursor browser tab issue. ${BROWSER_TAB_HELP}`
          );
        } else {
          throw err;
        }
      }
    }),

    api.commands.registerCommand("apolloSandbox.captureAuth", async () => {
      await runApolloCommand(
        api,
        "Apollo Sandbox: auto-detecting headers…",
        async () => {
          const config = await getResolvedConfig(api, browser);
          const auth = await autoDetectHeaders(browser, config);
          api.window.showInformationMessage(
            headerSummary(auth) + endpointHint(config)
          );
        }
      );
    }),

    api.commands.registerCommand("apolloSandbox.fillSandbox", async () => {
      await runApolloCommand(
        api,
        "Apollo Sandbox: detecting headers and filling…",
        async () => {
          const config = await getResolvedConfig(api, browser);
          const auth = await autoDetectHeaders(browser, config);
          await fillSandbox(browser, config, auth);
          api.window.showInformationMessage(
            `Sandbox filled. ${headerSummary(auth)}${endpointHint(config)}`
          );
        }
      );
    }),

    api.commands.registerCommand("apolloSandbox.runOperation", async () => {
      await runApolloCommand(
        api,
        "Apollo Sandbox: detecting headers and running…",
        async () => {
          const config = await getResolvedConfig(api, browser);
          await autoDetectHeaders(browser, config);
          const { data, ms } = await runOperation(browser, config);
          const preview = data
            ? JSON.stringify(data).slice(0, 120)
            : "see Response panel";
          api.window.showInformationMessage(
            `OK (${ms}ms): ${preview}${endpointHint(config)}`
          );
        }
      );
    }),

    api.commands.registerCommand("apolloSandbox.setupSandbox", async () => {
      await runApolloCommand(api, "Apollo Sandbox: auto-detect, fill…", async () => {
        const config = await getResolvedConfig(api, browser);
        const auth = await autoDetectHeaders(browser, config);
        await fillSandbox(browser, config, auth);
        api.window.showInformationMessage(
          `Apollo Sandbox ready. ${headerSummary(auth)}${endpointHint(config)}`
        );
      });
    }),

    api.commands.registerCommand("apolloSandbox.runExport", async () => {
      await api.commands.executeCommand("apolloSandbox.runOperation");
    }),

    api.commands.registerCommand(
      "apolloSandbox.setupExportTemplate",
      async () => {
        await api.commands.executeCommand("apolloSandbox.setupSandbox");
      }
    ),

    api.commands.registerCommand("apolloSandbox.runSelfTest", async () => {
      await runSelfTestCommand(api);
    })
  );

  if (extensionPath) {
    void maybeRunE2EOnActivation(api, extensionPath);
  }
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
