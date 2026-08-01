import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  APOLLO_COMMAND_IDS,
  registerApolloSandboxCommands
} from "../dist/extension.commands.js";
import {
  createMockBrowser,
  createMockVscode
} from "./helpers/mock-vscode.mjs";

describe("registerApolloSandboxCommands", () => {
  it("registers all apolloSandbox commands on context.subscriptions", () => {
    const vscode = createMockVscode();
    const browser = createMockBrowser();
    registerApolloSandboxCommands(vscode.context, {
      api: vscode,
      browser
    });

    assert.equal(vscode.handlers.size, APOLLO_COMMAND_IDS.length);
    assert.equal(APOLLO_COMMAND_IDS.length, 9);
    for (const id of APOLLO_COMMAND_IDS) {
      assert.ok(vscode.handlers.has(id), `missing handler for ${id}`);
    }
    assert.equal(
      vscode.context.subscriptions.length,
      APOLLO_COMMAND_IDS.length
    );
  });

  it("newBrowserTab opens a blank Cursor browser tab", async () => {
    const vscode = createMockVscode();
    let openedUrl;
    const browser = createMockBrowser({
      newTab: async (url) => {
        openedUrl = url;
        return "view-new";
      }
    });

    registerApolloSandboxCommands(vscode.context, { api: vscode, browser });
    await vscode.handlers.get("apolloSandbox.newBrowserTab")();

    assert.equal(openedUrl, "about:blank");
  });

  it("openGraphql ensures tab and shows information message", async () => {
    const vscode = createMockVscode({
      config: { graphqlUrl: "http://localhost:3001/graphql" }
    });
    let ensured = false;
    const browser = createMockBrowser({
      ensureBrowserTab: async (url) => {
        ensured = true;
        assert.equal(url, "http://localhost:3001/graphql");
      }
    });

    registerApolloSandboxCommands(vscode.context, { api: vscode, browser });
    await vscode.handlers.get("apolloSandbox.openGraphql")();

    assert.equal(ensured, true);
    assert.equal(vscode.infoMessages.length, 1);
    assert.match(vscode.infoMessages[0], /Opened http:\/\/localhost:3001\/graphql/);
  });

  it("openGraphql shows error message on browser view failure", async () => {
    const vscode = createMockVscode({
      config: { graphqlUrl: "http://localhost:3001/graphql" }
    });
    const browser = createMockBrowser({
      ensureBrowserTab: async () => {
        throw new Error("Browser view not found");
      }
    });

    registerApolloSandboxCommands(vscode.context, { api: vscode, browser });
    await vscode.handlers.get("apolloSandbox.openGraphql")();

    assert.equal(vscode.errorMessages.length, 1);
    assert.match(vscode.errorMessages[0], /Cursor browser tab issue/);
  });

  it("captureAuth runs withProgress and shows header summary", async () => {
    const vscode = createMockVscode({
      config: {
        graphqlUrl: "http://localhost:3001/graphql",
        headerDetectMs: 50,
        sandboxWaitMs: 50
      }
    });
    const browser = createMockBrowser({
      runInTab: async () => ({
        headers: { Authorization: "Bearer tok", "X-Company-Id": "1" },
        operation: "query Employees { items { id } }",
        variablesJson: "{}",
        probeOk: true,
        sources: ["apollo-link"],
        graphqlSeen: true
      })
    });

    registerApolloSandboxCommands(vscode.context, { api: vscode, browser });
    await vscode.handlers.get("apolloSandbox.captureAuth")();

    assert.equal(vscode.progressTitles.length, 1);
    assert.match(vscode.progressTitles[0], /auto-detecting headers/);
    assert.equal(vscode.infoMessages.length, 1);
    assert.match(vscode.infoMessages[0], /Captured 2 header\(s\) from GraphQL network traffic/);
  });

  it("runOperation shows OK preview from browser result", async () => {
    const vscode = createMockVscode({
      config: {
        graphqlUrl: "http://localhost:3001/graphql",
        headerDetectMs: 50,
        sandboxWaitMs: 50
      }
    });
    let runCount = 0;
    const browser = createMockBrowser({
      listTabs: async () => [],
      runInTab: async (script) => {
        runCount += 1;
        const s = String(script);
        if (s.includes("sessionStorage.setItem('__apolloAuth'")) {
          return true;
        }
        if (s.includes("const query =") && s.includes("fetch(")) {
          return { data: { __typename: "Query" }, ms: 42 };
        }
        return {
          headers: {
            Authorization: "Bearer x",
            "X-Company-Id": "1"
          },
          operation: "query Employees { items { id } }",
          variablesJson: "{}",
          probeOk: true,
          sources: ["apollo-link"],
          graphqlSeen: true
        };
      }
    });

    registerApolloSandboxCommands(vscode.context, { api: vscode, browser });
    await vscode.handlers.get("apolloSandbox.runOperation")();

    assert.ok(runCount >= 2);
    assert.equal(vscode.infoMessages.length, 1);
    assert.match(vscode.infoMessages[0], /OK \(42ms\)/);
  });

  it("runExport delegates to runOperation", async () => {
    const vscode = createMockVscode({
      config: { graphqlUrl: "http://localhost:3001/graphql" },
      commandHandlers: {
        "apolloSandbox.runOperation": async () => {
          vscode.infoMessages.push("delegated-runOperation");
        }
      }
    });
    const browser = createMockBrowser();

    registerApolloSandboxCommands(vscode.context, { api: vscode, browser });
    await vscode.handlers.get("apolloSandbox.runExport")();

    assert.deepEqual(vscode.infoMessages, ["delegated-runOperation"]);
  });

  it("runApolloCommand swallows browser view errors into showErrorMessage", async () => {
    const vscode = createMockVscode({
      config: { graphqlUrl: "http://localhost:3001/graphql" }
    });
    const browser = createMockBrowser({
      getEnrichedTabContext: async () => {
        throw new Error("Browser view not found");
      }
    });

    registerApolloSandboxCommands(vscode.context, { api: vscode, browser });
    await vscode.handlers.get("apolloSandbox.captureAuth")();

    assert.equal(vscode.errorMessages.length, 1);
    assert.match(vscode.errorMessages[0], /Cursor browser tab issue/);
  });
});

describe("activate wiring", () => {
  it("extension.commands exports match package.json activationEvents", async () => {
    const { APOLLO_COMMAND_IDS } = await import("../dist/extension.commands.js");
    const pkg = await import("../package.json", { with: { type: "json" } });
    const activationEvents = pkg.default.activationEvents.filter((e) =>
      e.startsWith("onCommand:")
    );
    const activated = activationEvents.map((e) => e.replace("onCommand:", ""));
    for (const id of activated) {
      assert.ok(APOLLO_COMMAND_IDS.includes(id), `APOLLO_COMMAND_IDS missing ${id}`);
    }
  });
});
