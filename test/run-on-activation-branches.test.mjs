import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { maybeRunE2EOnActivation } from "../dist/e2e/run-on-activation.js";
import { createMockVscode } from "./helpers/mock-vscode.mjs";

describe("maybeRunE2EOnActivation branches", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "apollo-e2e-branch-"));
    process.env.APOLLO_E2E = "1";
    process.env.APOLLO_E2E_RESULTS = path.join(tmpDir, "results.json");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.APOLLO_E2E;
    delete process.env.APOLLO_E2E_RESULTS;
    delete process.env.APOLLO_E2E_GRAPHQL_URL;
  });

  it("works when host api has no getCommands helper", async () => {
    const api = createMockVscode({
      commandHandlers: {
        "cursor.browserView.listTabs": async () => ({ tabs: [] }),
        "workbench.action.quit": async () => undefined
      }
    });
    delete api.commands.getCommands;

    await maybeRunE2EOnActivation(api, tmpDir);
    assert.ok(fs.existsSync(process.env.APOLLO_E2E_RESULTS));
  }, { timeout: 15000 });
});
