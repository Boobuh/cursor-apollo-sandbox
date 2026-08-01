import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  runCursorBrowserSelfTests,
  summarizeSelfTestResults
} from "../dist/e2e/self-test.js";

function createCommands(handlers, commandList) {
  return {
    executeCommand: async (cmd, ...args) => {
      const handler = handlers[cmd];
      if (!handler) throw new Error(`Unmocked: ${cmd}`);
      return handler(...args);
    },
    getCommands: async () => commandList
  };
}

describe("runCursorBrowserSelfTests", () => {
  it("passes when cursor browser APIs respond", async () => {
    let listCalls = 0;
    const commands = createCommands(
      {
        "cursor.browserView.listTabs": async () => {
          listCalls += 1;
          if (listCalls > 1) {
            return { tabs: [{ url: "http://localhost:3001/graphql" }] };
          }
          return { tabs: [] };
        },
        "cursor.browserView.newTab": async () => "tab-1",
        "cursor.browserView.selectTab": async () => ({ success: true }),
        "cursor.browserView.executeJavaScript": async () => "apollo-self-test",
        "cursor.browserView.navigate": async () => undefined,
        "apolloSandbox.openGraphql": async () => undefined
      },
      [
        "cursor.browserView.listTabs",
        "apolloSandbox.openGraphql",
        "apolloSandbox.captureAuth",
        "apolloSandbox.runOperation"
      ]
    );

    const results = await runCursorBrowserSelfTests(commands);
    const summary = summarizeSelfTestResults(results);
    assert.equal(summary.failed, 0, JSON.stringify(results));
    assert.ok(summary.passed >= 4);
  });

  it("skips browser cases when cursor API is absent", async () => {
    const commands = createCommands(
      {
        "cursor.browserView.listTabs": async () => {
          throw new Error("command not found");
        }
      },
      [
        "apolloSandbox.openGraphql",
        "apolloSandbox.captureAuth",
        "apolloSandbox.runOperation"
      ]
    );

    const results = await runCursorBrowserSelfTests(commands);
    const skipped = results.filter((r) => r.skipped);
    assert.ok(skipped.length >= 3);
    assert.equal(
      results.find((r) => r.name.includes("registered"))?.ok,
      true
    );
  });
});

describe("summarizeSelfTestResults", () => {
  it("counts passed failed skipped", () => {
    assert.deepEqual(
      summarizeSelfTestResults([
        { name: "a", ok: true },
        { name: "b", ok: true, skipped: true },
        { name: "c", ok: false, error: "x" }
      ]),
      { passed: 1, failed: 1, skipped: 1 }
    );
  });
});
