import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { registerApolloSandboxCommands, createDefaultDeps } from "../dist/extension.commands.js";
import { CursorBrowser } from "../dist/browser.js";
import {
  createMockBrowser,
  createMockVscode
} from "./helpers/mock-vscode.mjs";

describe("registerApolloSandboxCommands extended", () => {
  it("captureAuth shows browser tab help on browser view errors", async () => {
    const vscode = createMockVscode({
      config: { graphqlUrl: "http://localhost:3001/graphql" }
    });
    const browser = createMockBrowser({
      runInTab: async () => {
        throw new Error("Browser view not found");
      }
    });
    registerApolloSandboxCommands(vscode.context, { api: vscode, browser });
    await vscode.handlers.get("apolloSandbox.captureAuth")();
    assert.match(vscode.errorMessages[0], /Cursor browser tab issue/);
  });

  it("runOperation shows generic errors for non-browser failures", async () => {
    const vscode = createMockVscode({
      config: { graphqlUrl: "http://localhost:3001/graphql" }
    });
    const browser = createMockBrowser({
      runInTab: async () => {
        throw "plain string failure";
      }
    });
    registerApolloSandboxCommands(vscode.context, { api: vscode, browser });
    await vscode.handlers.get("apolloSandbox.runOperation")();
    assert.match(vscode.errorMessages[0], /plain string failure/);
  });

  it("runOperation uses fallback preview when response data is empty", async () => {
    const vscode = createMockVscode({
      config: {
        graphqlUrl: "http://localhost:3001/graphql",
        headerDetectMs: 50
      }
    });
    const browser = createMockBrowser({
      runInTab: async (script) => {
        const s = String(script);
        if (s.includes("const query =")) return { data: null, ms: 3 };
        return {
          headers: { Authorization: "Bearer x", "X-Company-Id": "1" },
          operation: "query Employees { items { id } }",
          variablesJson: "{}",
          sources: ["traffic"],
          probeOk: true
        };
      }
    });
    registerApolloSandboxCommands(vscode.context, { api: vscode, browser });
    await vscode.handlers.get("apolloSandbox.runOperation")();
    assert.match(vscode.infoMessages[0], /see Response panel/);
  });

  it("fillSandbox runs detect and fill flow", async () => {
    const vscode = createMockVscode({
      config: {
        graphqlUrl: "http://localhost:3001/graphql",
        headerDetectMs: 50,
        sandboxWaitMs: 50
      }
    });
    const browser = createMockBrowser({
      runInTab: async (script) => {
        const s = String(script);
        if (s.includes("embeddableSandbox")) return { ok: true, headerKeys: ["Authorization"] };
        return {
          headers: { Authorization: "Bearer x", "X-Company-Id": "1" },
          operation: "query Employees { items { id } }",
          variablesJson: "{}",
          sources: ["traffic"],
          probeOk: true
        };
      }
    });

    registerApolloSandboxCommands(vscode.context, { api: vscode, browser });
    await vscode.handlers.get("apolloSandbox.fillSandbox")();

    assert.match(vscode.progressTitles[0], /filling/);
    assert.match(vscode.infoMessages[0], /Sandbox filled/);
  });

  it("setupSandbox runs detect, fill, and operation", async () => {
    const vscode = createMockVscode({
      config: {
        graphqlUrl: "http://localhost:3001/graphql",
        headerDetectMs: 50,
        sandboxWaitMs: 50
      }
    });
    const browser = createMockBrowser({
      runInTab: async (script) => {
        const s = String(script);
        if (s.includes("const query =")) return { data: { ping: true }, ms: 7 };
        if (s.includes("embeddableSandbox")) return { ok: true };
        return {
          headers: { Authorization: "Bearer x", "X-Company-Id": "1" },
          operation: "query Employees { items { id } }",
          variablesJson: "{}",
          sources: ["traffic"],
          probeOk: true
        };
      }
    });

    registerApolloSandboxCommands(vscode.context, { api: vscode, browser });
    await vscode.handlers.get("apolloSandbox.setupSandbox")();

    assert.match(vscode.infoMessages[0], /Apollo Sandbox ready/);
  });

  it("setupExportTemplate delegates to setupSandbox", async () => {
    const vscode = createMockVscode({
      config: { graphqlUrl: "http://localhost:3001/graphql" },
      commandHandlers: {
        "apolloSandbox.setupSandbox": async () => {
          vscode.infoMessages.push("setup-called");
        }
      }
    });
    registerApolloSandboxCommands(vscode.context, {
      api: vscode,
      browser: createMockBrowser()
    });
    await vscode.handlers.get("apolloSandbox.setupExportTemplate")();
    assert.deepEqual(vscode.infoMessages, ["setup-called"]);
  });

  it("runSelfTest invokes E2E runner", async () => {
    const vscode = createMockVscode({
      commandHandlers: {
        "cursor.browserView.listTabs": async () => ({ tabs: [] }),
        "apolloSandbox.openGraphql": async () => undefined
      }
    });
    vscode.commands.getCommands = async () => [
      "apolloSandbox.openGraphql",
      "apolloSandbox.captureAuth",
      "apolloSandbox.runOperation"
    ];
    registerApolloSandboxCommands(vscode.context, {
      api: vscode,
      browser: createMockBrowser()
    });
    await vscode.handlers.get("apolloSandbox.runSelfTest")();
    assert.equal(vscode.infoMessages.length, 1);
  });

  it("newBrowserTab throws when tab cannot be opened", async () => {
    const vscode = createMockVscode();
    registerApolloSandboxCommands(vscode.context, {
      api: vscode,
      browser: createMockBrowser({ newTab: async () => undefined })
    });
    await vscode.handlers.get("apolloSandbox.newBrowserTab")();
    assert.match(vscode.errorMessages[0], /Could not open Cursor browser tab/);
  });

  it("createDefaultDeps wires CursorBrowser to host commands", () => {
    const api = createMockVscode();
    const deps = createDefaultDeps(api);
    assert.ok(deps.browser instanceof CursorBrowser);
    assert.equal(deps.api, api);
  });
});

describe("activate extension entry", () => {
  it("re-exports service and command helpers from extension bundle", async () => {
    const ext = await import("../dist/extension.commands.js");
    assert.equal(typeof ext.registerApolloSandboxCommands, "function");
    assert.equal(typeof ext.createDefaultDeps, "function");
  });
});
