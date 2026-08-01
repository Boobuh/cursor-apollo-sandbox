import * as fs from "fs";
import * as path from "path";
import type { ExtensionHostApi } from "../extension.types";
import {
  runCursorBrowserSelfTests,
  summarizeSelfTestResults,
  type SelfTestResult
} from "./self-test";

export interface E2ETriggerConfig {
  resultsPath: string;
  graphqlUrl?: string;
}

export function readE2ETrigger(
  extensionPath: string
): E2ETriggerConfig | undefined {
  if (process.env.APOLLO_E2E === "1" && process.env.APOLLO_E2E_RESULTS) {
    return {
      resultsPath: process.env.APOLLO_E2E_RESULTS,
      graphqlUrl: process.env.APOLLO_E2E_GRAPHQL_URL
    };
  }

  const triggerPath = path.join(extensionPath, "tmp", "e2e-trigger.json");
  if (!fs.existsSync(triggerPath)) return undefined;

  try {
    return JSON.parse(fs.readFileSync(triggerPath, "utf8")) as E2ETriggerConfig;
  } catch {
    return undefined;
  }
}

function selfTestCommands(api: ExtensionHostApi) {
  const getCommands = api.commands.getCommands;
  return {
    executeCommand: api.commands.executeCommand.bind(api.commands),
    getCommands: getCommands
      ? getCommands.bind(api.commands)
      : undefined
  };
}

/** When E2E trigger file or APOLLO_E2E env is set, run self-tests and write results. */
export async function maybeRunE2EOnActivation(
  api: ExtensionHostApi,
  extensionPath: string
): Promise<void> {
  const trigger = readE2ETrigger(extensionPath);
  if (!trigger?.resultsPath) return;

  if (trigger.graphqlUrl) {
    process.env.APOLLO_E2E_GRAPHQL_URL = trigger.graphqlUrl;
  }

  await new Promise((r) => setTimeout(r, 3000));

  let results: SelfTestResult[] = [];
  try {
    results = await runCursorBrowserSelfTests(selfTestCommands(api));
  } catch (err) {
    results = [
      {
        name: "self-test-runner",
        ok: false,
        error: err instanceof Error ? err.message : String(err)
      }
    ];
  }

  fs.writeFileSync(trigger.resultsPath, JSON.stringify({ results }, null, 2));

  const triggerPath = path.join(extensionPath, "tmp", "e2e-trigger.json");
  try {
    fs.unlinkSync(triggerPath);
  } catch {
    /* ignore */
  }

  const summary = summarizeSelfTestResults(results);
  if (summary.failed === 0) {
    api.window.showInformationMessage(
      `Apollo Sandbox E2E: ${summary.passed} passed, ${summary.skipped} skipped`
    );
  } else {
    api.window.showErrorMessage(
      `Apollo Sandbox E2E: ${summary.failed} failed — see ${trigger.resultsPath}`
    );
  }

  setTimeout(() => {
    void api.commands.executeCommand("workbench.action.quit");
  }, 1500);
}

export async function runSelfTestCommand(
  api: ExtensionHostApi
): Promise<void> {
  const results = await runCursorBrowserSelfTests(selfTestCommands(api));
  const summary = summarizeSelfTestResults(results);
  const failed = results.filter((r) => !r.ok);

  if (failed.length) {
    api.window.showErrorMessage(
      `E2E failed (${failed.length}): ${failed.map((f) => f.name).join(", ")}`
    );
    return;
  }

  api.window.showInformationMessage(
    `E2E passed: ${summary.passed} ok, ${summary.skipped} skipped`
  );
}
