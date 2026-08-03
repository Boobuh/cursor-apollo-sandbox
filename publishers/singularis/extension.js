const vscode = require("vscode");

const REPLACEMENT = "boobuh.cursor-apollo-sandbox";
const MESSAGE =
  "Singularis.singularis is a deprecated publisher placeholder — not Cursor Apollo Sandbox. " +
  "Uninstall this and install boobuh.cursor-apollo-sandbox instead.";

/** @param {vscode.ExtensionContext} context */
function activate(context) {
  void vscode.window
    .showWarningMessage(MESSAGE, "Open Cursor Apollo Sandbox")
    .then((choice) => {
      if (choice) {
        void vscode.commands.executeCommand(
          "workbench.extensions.search",
          REPLACEMENT
        );
      }
    });

  const disposable = vscode.commands.registerCommand("singularis.about", () => {
    void vscode.window.showWarningMessage(MESSAGE, "Open Cursor Apollo Sandbox").then(
      (choice) => {
        if (choice) {
          void vscode.commands.executeCommand(
            "workbench.extensions.search",
            REPLACEMENT
          );
        }
      }
    );
  });
  context.subscriptions.push(disposable);
}

function deactivate() {}

module.exports = { activate, deactivate };
