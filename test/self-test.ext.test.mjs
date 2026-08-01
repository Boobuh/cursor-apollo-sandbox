import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  runCursorBrowserSelfTests,
  summarizeSelfTestResults
} from "../dist/e2e/self-test.js";

describe("self-test coverage", () => {
  it("skips browser cases when executeCommand fallback fails", async () => {
    const results = await runCursorBrowserSelfTests({
      executeCommand: async () => {
        throw new Error("Browser view not found");
      }
    });
    const skipped = results.filter((r) => r.skipped);
    assert.ok(skipped.length >= 1);
  });

  it("runs browser cases when executeCommand fallback succeeds without getCommands", async () => {
    const results = await runCursorBrowserSelfTests({
      executeCommand: async (cmd) => {
        if (cmd === "cursor.browserView.listTabs") return { tabs: [] };
        throw new Error(`unexpected ${cmd}`);
      }
    });
    assert.ok(results.some((r) => r.name === "cursor.browserView.listTabs" && r.ok));
  });

  it("records failures from self-test cases", async () => {
    const results = await runCursorBrowserSelfTests({
      getCommands: async () => [
        "cursor.browserView.listTabs",
        "apolloSandbox.openGraphql",
        "apolloSandbox.captureAuth",
        "apolloSandbox.runOperation"
      ],
      executeCommand: async (cmd) => {
        if (cmd === "cursor.browserView.listTabs") return { tabs: "not-array" };
        if (cmd === "apolloSandbox.openGraphql") return undefined;
        throw new Error(`unexpected ${cmd}`);
      }
    });
    assert.ok(results.some((r) => !r.ok));
    const summary = summarizeSelfTestResults(results);
    assert.ok(summary.failed >= 1);
  });

  it("records missing apollo commands as failures", async () => {
    const results = await runCursorBrowserSelfTests({
      getCommands: async () => ["cursor.browserView.listTabs"],
      executeCommand: async (cmd) => {
        if (cmd === "cursor.browserView.listTabs") return { tabs: [] };
        throw new Error(`unexpected ${cmd}`);
      }
    });
    const failed = results.find((r) => r.name === "apolloSandbox commands registered");
    assert.equal(failed?.ok, false);
  });

  it("fails executeJavaScript case when newTab returns no viewId", async () => {
    const results = await runCursorBrowserSelfTests({
      getCommands: async () => [
        "cursor.browserView.listTabs",
        "cursor.browserView.newTab",
        "apolloSandbox.openGraphql",
        "apolloSandbox.captureAuth",
        "apolloSandbox.runOperation"
      ],
      executeCommand: async (cmd) => {
        if (cmd === "cursor.browserView.listTabs") return { tabs: [] };
        if (cmd === "cursor.browserView.newTab") return undefined;
        throw new Error(`unexpected ${cmd}`);
      }
    });
    const failed = results.find((r) => r.name === "executeJavaScript without viewId");
    assert.equal(failed?.ok, false);
  });

  it("fails when executeJavaScript does not return a string", async () => {
    const results = await runCursorBrowserSelfTests({
      getCommands: async () => [
        "cursor.browserView.listTabs",
        "cursor.browserView.newTab",
        "cursor.browserView.selectTab",
        "cursor.browserView.executeJavaScript",
        "apolloSandbox.openGraphql",
        "apolloSandbox.captureAuth",
        "apolloSandbox.runOperation"
      ],
      executeCommand: async (cmd) => {
        if (cmd === "cursor.browserView.listTabs") return { tabs: [] };
        if (cmd === "cursor.browserView.newTab") return "tab-1";
        if (cmd === "cursor.browserView.selectTab") return { success: true };
        if (cmd === "cursor.browserView.executeJavaScript") return 42;
        throw new Error(`unexpected ${cmd}`);
      }
    });
    const failed = results.find((r) => r.name === "executeJavaScript without viewId");
    assert.equal(failed?.ok, false);
  });

  it("fails navigate case when document title does not match", async () => {
    const results = await runCursorBrowserSelfTests({
      getCommands: async () => [
        "cursor.browserView.listTabs",
        "cursor.browserView.navigate",
        "cursor.browserView.executeJavaScript",
        "apolloSandbox.openGraphql",
        "apolloSandbox.captureAuth",
        "apolloSandbox.runOperation"
      ],
      executeCommand: async (cmd) => {
        if (cmd === "cursor.browserView.listTabs") return { tabs: [] };
        if (cmd === "cursor.browserView.navigate") return undefined;
        if (cmd === "cursor.browserView.executeJavaScript") return "wrong-title";
        throw new Error(`unexpected ${cmd}`);
      }
    });
    const failed = results.find((r) => r.name === "navigate active view without viewId");
    assert.equal(failed?.ok, false);
  }, { timeout: 15000 });

  it("fails openGraphql case when no graphql host tab appears", async () => {
    const results = await runCursorBrowserSelfTests({
      getCommands: async () => [
        "cursor.browserView.listTabs",
        "apolloSandbox.openGraphql",
        "apolloSandbox.captureAuth",
        "apolloSandbox.runOperation"
      ],
      executeCommand: async (cmd) => {
        if (cmd === "cursor.browserView.listTabs") {
          return { tabs: [{ url: "https://example.com/home" }] };
        }
        if (cmd === "apolloSandbox.openGraphql") return undefined;
        throw new Error(`unexpected ${cmd}`);
      }
    });
    const failed = results.find(
      (r) => r.name === "apolloSandbox.openGraphql opens graphql host tab"
    );
    assert.equal(failed?.ok, false);
  }, { timeout: 15000 });
});
