"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.__setE2ESelfTestRunnerForTests = __setE2ESelfTestRunnerForTests;
exports.readE2ETrigger = readE2ETrigger;
exports.maybeRunE2EOnActivation = maybeRunE2EOnActivation;
exports.runSelfTestCommand = runSelfTestCommand;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const self_test_1 = require("./self-test");
let e2eSelfTestRunner = self_test_1.runCursorBrowserSelfTests;
/** Test-only override for E2E runner error handling coverage. */
function __setE2ESelfTestRunnerForTests(runner) {
    e2eSelfTestRunner = runner ?? self_test_1.runCursorBrowserSelfTests;
}
function readE2ETrigger(extensionPath) {
    if (process.env.APOLLO_E2E !== "1") {
        return undefined;
    }
    if (process.env.APOLLO_E2E_RESULTS) {
        return {
            resultsPath: process.env.APOLLO_E2E_RESULTS,
            graphqlUrl: process.env.APOLLO_E2E_GRAPHQL_URL
        };
    }
    const triggerPath = path_1.default.join(extensionPath, "tmp", "e2e-trigger.json");
    if (!fs_1.default.existsSync(triggerPath))
        return undefined;
    try {
        return JSON.parse(fs_1.default.readFileSync(triggerPath, "utf8"));
    }
    catch {
        return undefined;
    }
}
function selfTestCommands(api) {
    const getCommands = api.commands.getCommands;
    return {
        executeCommand: api.commands.executeCommand.bind(api.commands),
        getCommands: getCommands
            ? getCommands.bind(api.commands)
            : undefined
    };
}
/** When APOLLO_E2E=1 and a trigger/results path is set, run self-tests and write results. */
async function maybeRunE2EOnActivation(api, extensionPath) {
    if (process.env.APOLLO_E2E !== "1")
        return;
    const trigger = readE2ETrigger(extensionPath);
    if (!trigger?.resultsPath)
        return;
    if (trigger.graphqlUrl) {
        process.env.APOLLO_E2E_GRAPHQL_URL = trigger.graphqlUrl;
    }
    await new Promise((r) => setTimeout(r, 3000));
    let results = [];
    try {
        results = await e2eSelfTestRunner(selfTestCommands(api));
    }
    catch (err) {
        results = [
            {
                name: "self-test-runner",
                ok: false,
                error: err instanceof Error ? err.message : String(err)
            }
        ];
    }
    try {
        fs_1.default.mkdirSync(path_1.default.dirname(trigger.resultsPath), { recursive: true });
        fs_1.default.writeFileSync(trigger.resultsPath, JSON.stringify({ results }, null, 2));
    }
    catch (err) {
        console.error("[Cursor Apollo Sandbox] E2E could not write results:", err instanceof Error ? err.message : String(err));
        return;
    }
    const triggerPath = path_1.default.join(extensionPath, "tmp", "e2e-trigger.json");
    try {
        fs_1.default.unlinkSync(triggerPath);
    }
    catch {
        /* ignore */
    }
    try {
        const summary = (0, self_test_1.summarizeSelfTestResults)(results);
        if (summary.failed === 0) {
            api.window.showInformationMessage(`Apollo Sandbox E2E: ${summary.passed} passed, ${summary.skipped} skipped`);
        }
        else {
            api.window.showErrorMessage(`Apollo Sandbox E2E: ${summary.failed} failed — see ${trigger.resultsPath}`);
        }
    }
    catch {
        /* UI unavailable — results file is enough for the runner */
    }
    setTimeout(() => {
        void Promise.resolve(api.commands.executeCommand("workbench.action.quit")).catch(() => {
            /* ignore quit failures */
        });
    }, 1500);
}
async function runSelfTestCommand(api) {
    const results = await (0, self_test_1.runCursorBrowserSelfTests)(selfTestCommands(api));
    const summary = (0, self_test_1.summarizeSelfTestResults)(results);
    const failed = results.filter((r) => !r.ok);
    if (failed.length) {
        api.window.showErrorMessage(`E2E failed (${failed.length}): ${failed.map((f) => f.name).join(", ")}`);
        return;
    }
    api.window.showInformationMessage(`E2E passed: ${summary.passed} ok, ${summary.skipped} skipped`);
}
//# sourceMappingURL=run-on-activation.js.map