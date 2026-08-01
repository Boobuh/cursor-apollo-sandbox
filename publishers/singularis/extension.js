const vscode = require("vscode");

/** @param {vscode.ExtensionContext} _context */
function activate(_context) {
  const disposable = vscode.commands.registerCommand("singularis.about", () => {
    void vscode.window.showInformationMessage(
      "Singularis — publisher namespace for extensions by Boobuh. " +
        "See publishers/singularis in the cursor-apollo-sandbox repo."
    );
  });
  _context.subscriptions.push(disposable);
}

function deactivate() {}

module.exports = { activate, deactivate };
