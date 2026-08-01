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
exports.deriveGraphqlUrlMatch = void 0;
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const browser_1 = require("./browser");
const browser_types_1 = require("./browser.types");
const browser_utils_1 = require("./browser.utils");
const graphql_url_1 = require("./apollo/graphql-url");
const header_detection_1 = require("./apollo/header-detection");
const sandbox_1 = require("./apollo/sandbox");
Object.defineProperty(exports, "deriveGraphqlUrlMatch", { enumerable: true, get: function () { return sandbox_1.deriveGraphqlUrlMatch; } });
const extension_helpers_1 = require("./extension.helpers");
function getBaseConfig() {
    const cfg = vscode.workspace.getConfiguration("apolloSandbox");
    const graphqlUrl = cfg.get("graphqlUrl") ?? "http://localhost:4000/graphql";
    const defaultOperation = cfg.get("defaultOperation")?.trim() || sandbox_1.FALLBACK_OPERATION;
    const defaultVariablesRaw = cfg.get("defaultVariables")?.trim() || sandbox_1.FALLBACK_VARIABLES_JSON;
    (0, sandbox_1.parseVariablesJson)(defaultVariablesRaw);
    return {
        authCaptureUrl: cfg.get("authCaptureUrl") ?? "",
        graphqlUrl,
        graphqlUrlFromBrowserTab: cfg.get("graphqlUrlFromBrowserTab") ?? false,
        graphqlUrlMatch: cfg.get("graphqlUrlMatch")?.trim() ?? "",
        sandboxWaitMs: cfg.get("sandboxWaitMs") ?? 9000,
        headerDetectMs: cfg.get("headerDetectMs") ?? 6000,
        defaultOperation,
        defaultVariablesJson: defaultVariablesRaw
    };
}
async function getResolvedConfig(browser) {
    return (0, graphql_url_1.resolveSandboxConfig)(browser, getBaseConfig());
}
async function runDetectOnTab(browser, detectScript, tabViewId, targetUrl) {
    try {
        return await browser.runInTab(detectScript, {
            hintViewId: tabViewId,
            targetUrl
        });
    }
    catch {
        return undefined;
    }
}
async function autoDetectHeaders(browser, config) {
    const detectScript = (0, header_detection_1.buildAutoDetectHeadersScript)(config.graphqlUrl, config.graphqlUrlMatch, config.headerDetectMs);
    const hosts = (0, extension_helpers_1.collectTargetHosts)(config);
    const parts = [];
    const visitedHosts = new Set();
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
        if (!hosts.has(host) || visitedHosts.has(host))
            continue;
        visitedHosts.add(host);
        const result = await runDetectOnTab(browser, detectScript, tab.viewId, tab.url);
        if (result)
            parts.push(result);
    }
    for (const url of [config.authCaptureUrl.trim(), config.graphqlUrl].filter(Boolean)) {
        await browser.ensureBrowserTab(url);
        await browser.waitForLoad(1500);
        const result = await browser.runInTab(detectScript, { targetUrl: url });
        if (result)
            parts.push(result);
    }
    const merged = (0, header_detection_1.mergeDetectedHeaders)(...parts);
    await browser.ensureBrowserTab(config.graphqlUrl);
    await browser.runInTab((0, header_detection_1.buildPersistHeadersScript)(merged.headers, merged), {
        targetUrl: config.graphqlUrl
    });
    if (!merged.probeOk &&
        !Object.keys(merged.headers).length &&
        !merged.graphqlSeen) {
        throw new Error("Could not auto-detect GraphQL headers. Log into your app in the Cursor browser, trigger a GraphQL request, then retry.");
    }
    return merged;
}
async function fillSandbox(browser, config, auth) {
    await browser.ensureBrowserTab(config.graphqlUrl);
    const iframeUrl = (0, sandbox_1.buildSandboxIframeUrl)(config.graphqlUrl, auth, config.defaultOperation, config.defaultVariablesJson);
    const result = await browser.runInTab((0, sandbox_1.buildFillSandboxScript)(iframeUrl, config.sandboxWaitMs), {
        targetUrl: config.graphqlUrl
    });
    if (result?.err) {
        throw new Error(result.err);
    }
    return result?.headerKeys ?? Object.keys(auth.headers);
}
async function runOperation(browser, config) {
    await browser.ensureBrowserTab(config.graphqlUrl);
    const result = await browser.runInTab((0, sandbox_1.buildRunOperationScript)(config.graphqlUrl, config.defaultOperation, config.defaultVariablesJson), { targetUrl: config.graphqlUrl });
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
async function runApolloCommand(title, fn) {
    try {
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title }, fn);
    }
    catch (err) {
        if ((0, browser_utils_1.isBrowserViewError)(err)) {
            vscode.window.showErrorMessage(`Apollo Sandbox: Cursor browser tab issue. ${browser_types_1.BROWSER_TAB_HELP}`);
            return;
        }
        throw err;
    }
}
function activate(context) {
    const browser = new browser_1.CursorBrowser(vscode.commands);
    context.subscriptions.push(vscode.commands.registerCommand("apolloSandbox.openGraphql", async () => {
        try {
            const config = await getResolvedConfig(browser);
            await browser.ensureBrowserTab(config.graphqlUrl);
            vscode.window.showInformationMessage(`Opened ${config.graphqlUrl}${(0, extension_helpers_1.endpointHint)(config)}`);
        }
        catch (err) {
            if ((0, browser_utils_1.isBrowserViewError)(err)) {
                vscode.window.showErrorMessage(`Apollo Sandbox: Cursor browser tab issue. ${browser_types_1.BROWSER_TAB_HELP}`);
            }
            else {
                throw err;
            }
        }
    }), vscode.commands.registerCommand("apolloSandbox.captureAuth", async () => {
        await runApolloCommand("Apollo Sandbox: auto-detecting headers…", async () => {
            const config = await getResolvedConfig(browser);
            const auth = await autoDetectHeaders(browser, config);
            vscode.window.showInformationMessage((0, extension_helpers_1.headerSummary)(auth) + (0, extension_helpers_1.endpointHint)(config));
        });
    }), vscode.commands.registerCommand("apolloSandbox.fillSandbox", async () => {
        await runApolloCommand("Apollo Sandbox: detecting headers and filling…", async () => {
            const config = await getResolvedConfig(browser);
            const auth = await autoDetectHeaders(browser, config);
            await fillSandbox(browser, config, auth);
            vscode.window.showInformationMessage(`Sandbox filled. ${(0, extension_helpers_1.headerSummary)(auth)}${(0, extension_helpers_1.endpointHint)(config)}`);
        });
    }), vscode.commands.registerCommand("apolloSandbox.runOperation", async () => {
        await runApolloCommand("Apollo Sandbox: detecting headers and running…", async () => {
            const config = await getResolvedConfig(browser);
            await autoDetectHeaders(browser, config);
            const { data, ms } = await runOperation(browser, config);
            const preview = data
                ? JSON.stringify(data).slice(0, 120)
                : "see Response panel";
            vscode.window.showInformationMessage(`OK (${ms}ms): ${preview}${(0, extension_helpers_1.endpointHint)(config)}`);
        });
    }), vscode.commands.registerCommand("apolloSandbox.setupSandbox", async () => {
        await runApolloCommand("Apollo Sandbox: auto-detect, fill…", async () => {
            const config = await getResolvedConfig(browser);
            const auth = await autoDetectHeaders(browser, config);
            await fillSandbox(browser, config, auth);
            vscode.window.showInformationMessage(`Apollo Sandbox ready. ${(0, extension_helpers_1.headerSummary)(auth)}${(0, extension_helpers_1.endpointHint)(config)}`);
        });
    }), vscode.commands.registerCommand("apolloSandbox.runExport", async () => {
        await vscode.commands.executeCommand("apolloSandbox.runOperation");
    }), vscode.commands.registerCommand("apolloSandbox.setupExportTemplate", async () => {
        await vscode.commands.executeCommand("apolloSandbox.setupSandbox");
    }));
}
function deactivate() { }
//# sourceMappingURL=extension.js.map