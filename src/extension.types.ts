import type * as vscode from "vscode";

/** VS Code / Cursor host surface used by Apollo Sandbox commands (mockable in tests). */
export interface ExtensionHostApi {
  commands: Pick<typeof vscode.commands, "registerCommand" | "executeCommand"> & {
    getCommands?: typeof vscode.commands.getCommands;
  };
  window: Pick<
    typeof vscode.window,
    "showInformationMessage" | "showErrorMessage" | "withProgress"
  >;
  workspace: Pick<typeof vscode.workspace, "getConfiguration">;
  ProgressLocation: typeof vscode.ProgressLocation;
}

export interface ExtensionCommandDeps {
  api: ExtensionHostApi;
  browser: import("./browser").CursorBrowser;
}
