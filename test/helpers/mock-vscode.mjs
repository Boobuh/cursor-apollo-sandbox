/**
 * @typedef {object} MockVscodeOptions
 * @property {Record<string, unknown>} [config]
 * @property {Record<string, (...args: unknown[]) => unknown>} [commandHandlers]
 */

/** @returns {import("../../dist/extension.types.js").ExtensionHostApi & { context: { subscriptions: unknown[] }, handlers: Map<string, (...args: unknown[]) => Promise<unknown>>, infoMessages: string[], errorMessages: string[], progressTitles: string[] }} */
export function createMockVscode(options = {}) {
  /** @type {import("../../dist/extension.types.js").ExtensionHostApi & { context: { subscriptions: unknown[] }, handlers: Map<string, (...args: unknown[]) => Promise<unknown>>, infoMessages: string[], errorMessages: string[], progressTitles: string[] }} */
  const mock = {
    context: { subscriptions: [], extensionPath: "" },
    handlers: new Map(),
    infoMessages: [],
    errorMessages: [],
    progressTitles: [],
    ProgressLocation: { Notification: 15 },
    commands: {
      registerCommand: (id, handler) => {
        mock.handlers.set(id, handler);
        return { dispose: () => mock.handlers.delete(id) };
      },
      executeCommand: async (id, ...args) => {
        if (options.commandHandlers?.[id]) {
          return options.commandHandlers[id](...args);
        }
        const handler = mock.handlers.get(id);
        if (!handler) {
          throw new Error(`Unmocked executeCommand: ${id}`);
        }
        return handler(...args);
      }
    },
    window: {
      showInformationMessage: async (msg) => {
        mock.infoMessages.push(String(msg));
        return undefined;
      },
      showErrorMessage: async (msg) => {
        mock.errorMessages.push(String(msg));
        return undefined;
      },
      withProgress: async (_opts, task) => {
        mock.progressTitles.push(String(_opts.title));
        return task();
      }
    },
    workspace: {
      getConfiguration: () => ({
        get: (key) => options.config?.[key]
      })
    }
  };

  return mock;
}

/** Minimal CursorBrowser stand-in for command tests. */
export function createMockBrowser(overrides = {}) {
  const graphqlUrl = "http://localhost:3001/graphql";
  return {
    getTabContext: async () => ({ tabs: [], activeViewId: undefined }),
    listTabs: async () => [],
    ensureBrowserTab: async () => undefined,
    waitForLoad: async () => undefined,
    runInTab: async () => ({
      headers: { Authorization: "Bearer test" },
      probeOk: true,
      sources: ["probe:cookie-only"],
      graphqlSeen: true
    }),
    ...overrides,
    _graphqlUrl: graphqlUrl
  };
}

export const defaultSandboxConfig = {
  authCaptureUrl: "",
  graphqlUrl: "http://localhost:3001/graphql",
  graphqlUrlFromBrowserTab: false,
  graphqlUrlMatch: "/graphql",
  sandboxWaitMs: 100,
  headerDetectMs: 100,
  defaultOperation: "query { __typename }",
  defaultVariablesJson: "{}",
  graphqlUrlSource: "settings"
};
