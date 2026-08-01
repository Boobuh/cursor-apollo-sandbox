import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runApolloCommand } from "../dist/extension.service.js";
import { createMockVscode } from "./helpers/mock-vscode.mjs";

describe("runApolloCommand", () => {
  it("runs task inside withProgress", async () => {
    const vscode = createMockVscode();
    let ran = false;
    await runApolloCommand(vscode, "Test progress", async () => {
      ran = true;
    });
    assert.equal(ran, true);
    assert.deepEqual(vscode.progressTitles, ["Test progress"]);
  });

  it("maps browser view errors to showErrorMessage", async () => {
    const vscode = createMockVscode();
    await runApolloCommand(vscode, "Fail", async () => {
      throw new Error("Browser view not found");
    });
    assert.equal(vscode.errorMessages.length, 1);
    assert.match(vscode.errorMessages[0], /Cursor browser tab issue/);
  });

  it("rethrows non-browser errors", async () => {
    const vscode = createMockVscode();
    await assert.rejects(
      () =>
        runApolloCommand(vscode, "Fail", async () => {
          throw new Error("Network error");
        }),
      /Network error/
    );
  });
});
