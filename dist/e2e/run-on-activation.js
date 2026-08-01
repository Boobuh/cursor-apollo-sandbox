"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.readE2ETrigger = readE2ETrigger;
exports.maybeRunE2EOnActivation = maybeRunE2EOnActivation;
exports.runSelfTestCommand = runSelfTestCommand;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const self_test_1 = require("./self-test");
function readE2ETrigger(extensionPath) {
    if (process.env.APOLLO_E2E === "1" && process.env.APOLLO_E2E_RESULTS) {
        return {
            resultsPath: process.env.APOLLO_E2E_RESULTS,
            graphqlUrl: process.env.APOLLO_E2E_GRAPHQL_URL
        };
    }
    const triggerPath = path.join(extensionPath, "tmp", "e2e-trigger.json");
    if (!fs.existsSync(triggerPath))
        return undefined;
    try {
        return JSON.parse(fs.readFileSync(triggerPath, "utf8"));
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
/** When E2E trigger file or APOLLO_E2E env is set, run self-tests and write results. */
async function maybeRunE2EOnActivation(api, extensionPath) {
    const trigger = readE2ETrigger(extensionPath);
    if (!trigger?.resultsPath)
        return;
    if (trigger.graphqlUrl) {
        process.env.APOLLO_E2E_GRAPHQL_URL = trigger.graphqlUrl;
    }
    await new Promise((r) => setTimeout(r, 3000));
    let results = [];
    try {
        results = await (0, self_test_1.runCursorBrowserSelfTests)(selfTestCommands(api));
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
    fs.writeFileSync(trigger.resultsPath, JSON.stringify({ results }, null, 2));
    const triggerPath = path.join(extensionPath, "tmp", "e2e-trigger.json");
    try {
        fs.unlinkSync(triggerPath);
    }
    catch {
        /* ignore */
    }
    const summary = (0, self_test_1.summarizeSelfTestResults)(results);
    if (summary.failed === 0) {
        api.window.showInformationMessage(`Apollo Sandbox E2E: ${summary.passed} passed, ${summary.skipped} skipped`);
    }
    else {
        api.window.showErrorMessage(`Apollo Sandbox E2E: ${summary.failed} failed — see ${trigger.resultsPath}`);
    }
    setTimeout(() => {
        void api.commands.executeCommand("workbench.action.quit");
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