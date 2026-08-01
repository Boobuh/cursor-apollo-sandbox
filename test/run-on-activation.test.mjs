import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  __setE2ESelfTestRunnerForTests,
  maybeRunE2EOnActivation,
  readE2ETrigger,
  runSelfTestCommand
} from "../dist/e2e/run-on-activation.js";
import { createMockVscode } from "./helpers/mock-vscode.mjs";

describe("readE2ETrigger file fallback", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "apollo-e2e-"));
    process.env.APOLLO_E2E = "1";
    delete process.env.APOLLO_E2E_RESULTS;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.APOLLO_E2E;
    delete process.env.APOLLO_E2E_RESULTS;
    delete process.env.APOLLO_E2E_GRAPHQL_URL;
  });

  it("reads tmp/e2e-trigger.json when env results path unset", () => {
    const trigger = { resultsPath: path.join(tmpDir, "out.json"), graphqlUrl: "http://x/graphql" };
    fs.mkdirSync(path.join(tmpDir, "tmp"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "tmp", "e2e-trigger.json"), JSON.stringify(trigger));
    assert.deepEqual(readE2ETrigger(tmpDir), trigger);
  });

  it("returns undefined for invalid trigger JSON", () => {
    fs.mkdirSync(path.join(tmpDir, "tmp"), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, "tmp", "e2e-trigger.json"), "{not json");
    assert.equal(readE2ETrigger(tmpDir), undefined);
  });
});

describe("maybeRunE2EOnActivation", () => {
  let tmpDir;
  const originalQuit = process.env.APOLLO_E2E;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "apollo-e2e-run-"));
    process.env.APOLLO_E2E = "1";
    process.env.APOLLO_E2E_RESULTS = path.join(tmpDir, "results.json");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (originalQuit === undefined) delete process.env.APOLLO_E2E;
    else process.env.APOLLO_E2E = originalQuit;
    delete process.env.APOLLO_E2E_RESULTS;
    delete process.env.APOLLO_E2E_GRAPHQL_URL;
  });

  it("no-ops when APOLLO_E2E is unset", async () => {
    delete process.env.APOLLO_E2E;
    const api = createMockVscode();
    await maybeRunE2EOnActivation(api, tmpDir);
    assert.equal(fs.existsSync(path.join(tmpDir, "results.json")), false);
  });

  it("writes self-test results and shows success toast", async () => {
    const api = createMockVscode({
      commandHandlers: {
        "cursor.browserView.listTabs": async () => ({ tabs: [] }),
        "apolloSandbox.openGraphql": async () => undefined,
        "workbench.action.quit": async () => undefined
      }
    });
    api.commands.getCommands = async () => [
      "apolloSandbox.openGraphql",
      "apolloSandbox.captureAuth",
      "apolloSandbox.runOperation"
    ];

    await maybeRunE2EOnActivation(api, tmpDir);

    assert.ok(fs.existsSync(process.env.APOLLO_E2E_RESULTS));
    const payload = JSON.parse(fs.readFileSync(process.env.APOLLO_E2E_RESULTS, "utf8"));
    assert.ok(Array.isArray(payload.results));
  }, { timeout: 15000 });
});

describe("runSelfTestCommand", () => {
  it("shows error message when a self-test fails", async () => {
    const api = createMockVscode({
      commandHandlers: {
        "cursor.browserView.listTabs": async () => {
          throw new Error("Browser view not found");
        }
      }
    });
    api.commands.getCommands = async () => ["apolloSandbox.openGraphql"];

    await runSelfTestCommand(api);
    assert.equal(api.errorMessages.length, 1);
    assert.match(api.errorMessages[0], /E2E failed/);
  });

  it("shows success message when self-tests pass", async () => {
    const api = createMockVscode({
      commandHandlers: {
        "cursor.browserView.listTabs": async () => ({ tabs: [] }),
        "apolloSandbox.openGraphql": async () => undefined
      }
    });
    api.commands.getCommands = async () => [
      "apolloSandbox.openGraphql",
      "apolloSandbox.captureAuth",
      "apolloSandbox.runOperation"
    ];

    await runSelfTestCommand(api);
    assert.equal(api.infoMessages.length, 1);
    assert.match(api.infoMessages[0], /E2E passed/);
  });
});

describe("maybeRunE2EOnActivation failure paths", () => {
  let tmpDir;
  const originalWrite = fs.writeFileSync;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "apollo-e2e-fail-"));
    process.env.APOLLO_E2E = "1";
    process.env.APOLLO_E2E_RESULTS = path.join(tmpDir, "results.json");
  });

  afterEach(() => {
    fs.writeFileSync = originalWrite;
    __setE2ESelfTestRunnerForTests(null);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.APOLLO_E2E;
    delete process.env.APOLLO_E2E_RESULTS;
    delete process.env.APOLLO_E2E_GRAPHQL_URL;
  });

  it("writes runner error when self-tests throw", async () => {
    __setE2ESelfTestRunnerForTests(async () => {
      throw new Error("runner boom");
    });
    const api = createMockVscode({
      commandHandlers: {
        "workbench.action.quit": async () => undefined
      }
    });

    await maybeRunE2EOnActivation(api, tmpDir);

    const payload = JSON.parse(fs.readFileSync(process.env.APOLLO_E2E_RESULTS, "utf8"));
    assert.equal(payload.results[0]?.name, "self-test-runner");
    assert.equal(payload.results[0]?.ok, false);
  }, { timeout: 15000 });

  it("shows error toast when self-tests fail", async () => {
    const api = createMockVscode({
      commandHandlers: {
        "cursor.browserView.listTabs": async () => ({ tabs: "bad" }),
        "workbench.action.quit": async () => undefined
      }
    });
    api.commands.getCommands = async () => [
      "cursor.browserView.listTabs",
      "apolloSandbox.openGraphql",
      "apolloSandbox.captureAuth",
      "apolloSandbox.runOperation"
    ];

    await maybeRunE2EOnActivation(api, tmpDir);
    assert.equal(api.errorMessages.length, 1);
    assert.match(api.errorMessages[0], /failed/);
  }, { timeout: 15000 });

  it("returns early when results file cannot be written", async () => {
    fs.writeFileSync = () => {
      throw new Error("disk full");
    };
    const api = createMockVscode({
      commandHandlers: {
        "cursor.browserView.listTabs": async () => ({ tabs: [] }),
        "workbench.action.quit": async () => undefined
      }
    });
    api.commands.getCommands = async () => [
      "apolloSandbox.openGraphql",
      "apolloSandbox.captureAuth",
      "apolloSandbox.runOperation"
    ];

    await maybeRunE2EOnActivation(api, tmpDir);
    assert.equal(api.infoMessages.length, 0);
    assert.equal(api.errorMessages.length, 0);
  }, { timeout: 15000 });

  it("applies graphqlUrl from trigger config", async () => {
    delete process.env.APOLLO_E2E_RESULTS;
    delete process.env.APOLLO_E2E_GRAPHQL_URL;
    fs.mkdirSync(path.join(tmpDir, "tmp"), { recursive: true });
    const resultsPath = path.join(tmpDir, "trigger-results.json");
    fs.writeFileSync(
      path.join(tmpDir, "tmp", "e2e-trigger.json"),
      JSON.stringify({
        resultsPath,
        graphqlUrl: "http://trigger-host/graphql"
      })
    );

    const api = createMockVscode({
      commandHandlers: {
        "cursor.browserView.listTabs": async () => ({ tabs: [] }),
        "workbench.action.quit": async () => undefined
      }
    });
    api.commands.getCommands = async () => [
      "apolloSandbox.openGraphql",
      "apolloSandbox.captureAuth",
      "apolloSandbox.runOperation"
    ];

    await maybeRunE2EOnActivation(api, tmpDir);
    assert.equal(process.env.APOLLO_E2E_GRAPHQL_URL, "http://trigger-host/graphql");
    assert.ok(fs.existsSync(resultsPath));
  }, { timeout: 15000 });

  it("tolerates toast failures and quit command errors", async () => {
    const api = createMockVscode({
      commandHandlers: {
        "cursor.browserView.listTabs": async () => ({ tabs: "bad" }),
        "workbench.action.quit": async () => {
          throw new Error("quit blocked");
        }
      }
    });
    api.commands.getCommands = async () => [
      "cursor.browserView.listTabs",
      "apolloSandbox.openGraphql",
      "apolloSandbox.captureAuth",
      "apolloSandbox.runOperation"
    ];
    api.window.showErrorMessage = () => {
      throw new Error("toast unavailable");
    };

    await maybeRunE2EOnActivation(api, tmpDir);
    await new Promise((r) => setTimeout(r, 1600));
    assert.ok(fs.existsSync(process.env.APOLLO_E2E_RESULTS));
  }, { timeout: 15000 });
});
