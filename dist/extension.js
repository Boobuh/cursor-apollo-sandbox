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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const browser_1 = require("./browser");
const header_detection_1 = require("./apollo/header-detection");
const sandbox_1 = require("./apollo/sandbox");
function getConfig() {
    const cfg = vscode.workspace.getConfiguration("apolloSandbox");
    const graphqlUrl = cfg.get("graphqlUrl") ?? "http://localhost:4000/graphql";
    const defaultOperation = cfg.get("defaultOperation")?.trim() || sandbox_1.FALLBACK_OPERATION;
    const defaultVariablesRaw = cfg.get("defaultVariables")?.trim() || sandbox_1.FALLBACK_VARIABLES_JSON;
    (0, sandbox_1.parseVariablesJson)(defaultVariablesRaw);
    return {
        authCaptureUrl: cfg.get("authCaptureUrl") ?? "",
        graphqlUrl,
        graphqlUrlMatch: cfg.get("graphqlUrlMatch")?.trim() ||
            (0, sandbox_1.deriveGraphqlUrlMatch)(graphqlUrl),
        sandboxWaitMs: cfg.get("sandboxWaitMs") ?? 9000,
        headerDetectMs: cfg.get("headerDetectMs") ?? 6000,
        defaultOperation,
        defaultVariablesJson: defaultVariablesRaw
    };
}
function collectTargetHosts(config) {
    const hosts = new Set();
    for (const raw of [config.graphqlUrl, config.authCaptureUrl.trim()]) {
        if (!raw)
            continue;
        try {
            hosts.add(new URL(raw).hostname);
        }
        catch {
            /* ignore invalid URL */
        }
    }
    return hosts;
}
async function autoDetectHeaders(browser) {
    const config = getConfig();
    const detectScript = (0, header_detection_1.buildAutoDetectHeadersScript)(config.graphqlUrl, config.graphqlUrlMatch, config.headerDetectMs);
    const hosts = collectTargetHosts(config);
    const parts = [];
    const visitedTabs = new Set();
    for (const tab of await browser.listTabs()) {
        if (!tab.viewId || !tab.url)
            continue;
        let host = "";
        try {
            host = new URL(tab.url).hostname;
        }
        catch {
            continue;
        }
        if (!hosts.has(host))
            continue;
        visitedTabs.add(tab.viewId);
        const result = await browser.executeJavaScript(detectScript, tab.viewId);
        if (result)
            parts.push(result);
    }
    const urlsToOpen = [
        config.authCaptureUrl.trim(),
        config.graphqlUrl
    ].filter(Boolean);
    for (const url of urlsToOpen) {
        const tabId = await (0, browser_1.ensureBrowserTab)(browser, url);
        if (visitedTabs.has(tabId))
            continue;
        visitedTabs.add(tabId);
        await browser.waitForLoad(1500);
        const result = await browser.executeJavaScript(detectScript, tabId);
        if (result)
            parts.push(result);
    }
    const merged = (0, header_detection_1.mergeDetectedHeaders)(...parts);
    const gqlTab = await (0, browser_1.ensureBrowserTab)(browser, config.graphqlUrl);
    await browser.executeJavaScript((0, header_detection_1.buildPersistHeadersScript)(merged.headers, merged), gqlTab);
    if (!merged.probeOk &&
        !Object.keys(merged.headers).length &&
        !merged.graphqlSeen) {
        throw new Error("Could not auto-detect GraphQL headers. Log into your app in the Cursor browser, trigger a GraphQL request, then retry.");
    }
    return merged;
}
async function fillSandbox(browser, auth, viewId) {
    const config = getConfig();
    const tabId = await (0, browser_1.ensureBrowserTab)(browser, config.graphqlUrl, viewId);
    const iframeUrl = (0, sandbox_1.buildSandboxIframeUrl)(config.graphqlUrl, auth, config.defaultOperation, config.defaultVariablesJson);
    const result = await browser.executeJavaScript((0, sandbox_1.buildFillSandboxScript)(iframeUrl, config.sandboxWaitMs), tabId);
    if (result?.err) {
        throw new Error(result.err);
    }
    return result?.headerKeys ?? Object.keys(auth.headers);
}
async function runOperation(browser, viewId) {
    const config = getConfig();
    const tabId = await (0, browser_1.ensureBrowserTab)(browser, config.graphqlUrl, viewId);
    const result = await browser.executeJavaScript((0, sandbox_1.buildRunOperationScript)(config.graphqlUrl, config.defaultOperation, config.defaultVariablesJson), tabId);
    if (!result) {
        throw new Error("No response from browser");
    }
    if (result.err) {
        throw new Error(result.err);
    }
    if (result.errors?.length) {
        throw new Error(result.errors.join("; "));
    }
    return { data: result.data, ms: result.ms };
}
function headerSummary(auth) {
    const keys = Object.keys(auth.headers);
    const sources = auth.sources?.length
        ? ` (${auth.sources.join(", ")})`
        : "";
    const verified = auth.probeOk ? " — probe OK" : "";
    if (!keys.length) {
        return auth.probeOk || auth.graphqlSeen
            ? `Using cookie session for GraphQL${sources}${verified}.`
            : `No extra headers detected${sources}.`;
    }
    return `Auto-detected ${keys.length} header(s): ${keys.join(", ")}${sources}${verified}.`;
}
function activate(context) {
    const browser = new browser_1.CursorBrowser(vscode.commands);
    context.subscriptions.push(vscode.commands.registerCommand("apolloSandbox.openGraphql", async () => {
        const { graphqlUrl } = getConfig();
        await (0, browser_1.ensureBrowserTab)(browser, graphqlUrl);
        vscode.window.showInformationMessage(`Opened ${graphqlUrl}`);
    }), vscode.commands.registerCommand("apolloSandbox.captureAuth", async () => {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Apollo Sandbox: auto-detecting headers…"
        }, async () => {
            const auth = await autoDetectHeaders(browser);
            vscode.window.showInformationMessage(headerSummary(auth));
        });
    }), vscode.commands.registerCommand("apolloSandbox.fillSandbox", async () => {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Apollo Sandbox: detecting headers and filling…"
        }, async () => {
            const auth = await autoDetectHeaders(browser);
            await fillSandbox(browser, auth);
            vscode.window.showInformationMessage(`Sandbox filled. ${headerSummary(auth)}`);
        });
    }), vscode.commands.registerCommand("apolloSandbox.runOperation", async () => {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Apollo Sandbox: detecting headers and running…"
        }, async () => {
            await autoDetectHeaders(browser);
            const { data, ms } = await runOperation(browser);
            const preview = data
                ? JSON.stringify(data).slice(0, 120)
                : "see Response panel";
            vscode.window.showInformationMessage(`OK (${ms}ms): ${preview}`);
        });
    }), vscode.commands.registerCommand("apolloSandbox.setupSandbox", async () => {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Apollo Sandbox: auto-detect, fill…"
        }, async () => {
            const auth = await autoDetectHeaders(browser);
            await fillSandbox(browser, auth);
            vscode.window.showInformationMessage(`Apollo Sandbox ready. ${headerSummary(auth)}`);
        });
    }), vscode.commands.registerCommand("apolloSandbox.runExport", async () => {
        await vscode.commands.executeCommand("apolloSandbox.runOperation");
    }), vscode.commands.registerCommand("apolloSandbox.setupExportTemplate", async () => {
        await vscode.commands.executeCommand("apolloSandbox.setupSandbox");
    }));
}
function deactivate() { }
//# sourceMappingURL=extension.js.map