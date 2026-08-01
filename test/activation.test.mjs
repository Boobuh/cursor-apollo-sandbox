import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readE2ETrigger } from "../dist/e2e/run-on-activation.js";
import { registerApolloSandboxCommands } from "../dist/extension.commands.js";
import { createMockBrowser, createMockVscode } from "./helpers/mock-vscode.mjs";

describe("readE2ETrigger startup safety", () => {
  const originalE2E = process.env.APOLLO_E2E;

  afterEach(() => {
    if (originalE2E === undefined) delete process.env.APOLLO_E2E;
    else process.env.APOLLO_E2E = originalE2E;
  });

  it("returns undefined when APOLLO_E2E is not set (ignores trigger files)", () => {
    delete process.env.APOLLO_E2E;
    process.env.APOLLO_E2E_RESULTS = "/tmp/should-not-run.json";
    assert.equal(readE2ETrigger("/any/path"), undefined);
  });

  it("returns env config when APOLLO_E2E=1 and APOLLO_E2E_RESULTS is set", () => {
    process.env.APOLLO_E2E = "1";
    process.env.APOLLO_E2E_RESULTS = "/tmp/e2e-results.json";
    process.env.APOLLO_E2E_GRAPHQL_URL = "http://localhost:9999/graphql";

    assert.deepEqual(readE2ETrigger("/any/path"), {
      resultsPath: "/tmp/e2e-results.json",
      graphqlUrl: "http://localhost:9999/graphql"
    });
  });
});

describe("command handler safety", () => {
  it("openGraphql shows error instead of throwing on unexpected failure", async () => {
    const vscode = createMockVscode({
      config: { graphqlUrl: "http://localhost:3001/graphql" }
    });
    const browser = createMockBrowser({
      ensureBrowserTab: async () => {
        throw new Error("unexpected boom");
      }
    });

    registerApolloSandboxCommands(vscode.context, { api: vscode, browser });
    await vscode.handlers.get("apolloSandbox.openGraphql")();

    assert.equal(vscode.errorMessages.length, 1);
    assert.match(vscode.errorMessages[0], /unexpected boom/);
  });
});
