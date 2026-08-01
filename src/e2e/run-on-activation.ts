import fs from "fs";
import path from "path";
import type { ExtensionHostApi } from "../extension.types";
import {
  runCursorBrowserSelfTests,
  summarizeSelfTestResults,
  type SelfTestResult
} from "./self-test";

export type E2ESelfTestRunner = typeof runCursorBrowserSelfTests;

let e2eSelfTestRunner: E2ESelfTestRunner = runCursorBrowserSelfTests;

/** Test-only override for E2E runner error handling coverage. */
export function __setE2ESelfTestRunnerForTests(
  runner: E2ESelfTestRunner | null
): void {
  e2eSelfTestRunner = runner ?? runCursorBrowserSelfTests;
}

export interface E2ETriggerConfig {
  resultsPath: string;
  graphqlUrl?: string;
}

export function readE2ETrigger(
  extensionPath: string
): E2ETriggerConfig | undefined {
  if (process.env.APOLLO_E2E !== "1") {
    return undefined;
  }

  if (process.env.APOLLO_E2E_RESULTS) {
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

/** When APOLLO_E2E=1 and a trigger/results path is set, run self-tests and write results. */
export async function maybeRunE2EOnActivation(
  api: ExtensionHostApi,
  extensionPath: string
): Promise<void> {
  if (process.env.APOLLO_E2E !== "1") return;

  const trigger = readE2ETrigger(extensionPath);
  if (!trigger?.resultsPath) return;

  if (trigger.graphqlUrl) {
    process.env.APOLLO_E2E_GRAPHQL_URL = trigger.graphqlUrl;
  }

  await new Promise((r) => setTimeout(r, 3000));

  let results: SelfTestResult[] = [];
  try {
    results = await e2eSelfTestRunner(selfTestCommands(api));
  } catch (err) {
    results = [
      {
        name: "self-test-runner",
        ok: false,
        error: err instanceof Error ? err.message : String(err)
      }
    ];
  }

  try {
    fs.mkdirSync(path.dirname(trigger.resultsPath), { recursive: true });
    fs.writeFileSync(trigger.resultsPath, JSON.stringify({ results }, null, 2));
  } catch (err) {
    console.error(
      "[Cursor Apollo Sandbox] E2E could not write results:",
      err instanceof Error ? err.message : String(err)
    );
    return;
  }

  const triggerPath = path.join(extensionPath, "tmp", "e2e-trigger.json");
  try {
    fs.unlinkSync(triggerPath);
  } catch {
    /* ignore */
  }

  try {
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
  } catch {
    /* UI unavailable — results file is enough for the runner */
  }

  setTimeout(() => {
    void Promise.resolve(api.commands.executeCommand("workbench.action.quit")).catch(
      () => {
        /* ignore quit failures */
      }
    );
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
