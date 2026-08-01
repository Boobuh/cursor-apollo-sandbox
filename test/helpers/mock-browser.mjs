/**
 * Mock vscode.commands.executeCommand for CursorBrowser tests.
 * @param {Record<string, (...args: unknown[]) => unknown | Promise<unknown>>} handlers
 */
export function createMockCommands(handlers) {
  /** @type {Array<{ cmd: string, args: unknown[] }>} */
  const calls = [];

  return {
    calls,
    commands: {
      executeCommand: async (cmd, ...args) => {
        calls.push({ cmd, args });
        const handler = handlers[cmd];
        if (!handler) {
          throw new Error(`Unmocked command: ${cmd}`);
        }
        return handler(...args);
      }
    }
  };
}

/** @param {import("../../dist/browser.types.js").BrowserTabContext} ctx */
export function tabContext(ctx) {
  return async () => ctx;
}
