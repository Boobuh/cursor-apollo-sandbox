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
        defaultOperation,
        defaultVariablesJson: defaultVariablesRaw
    };
}
function authCaptureTarget(config) {
    return config.authCaptureUrl.trim() || config.graphqlUrl;
}
async function captureAuth(browser, viewId) {
    const config = getConfig();
    const targetUrl = authCaptureTarget(config);
    const tabId = await (0, browser_1.ensureBrowserTab)(browser, targetUrl, viewId);
    await browser.waitForLoad(2000);
    const auth = await browser.executeJavaScript((0, sandbox_1.buildCaptureAuthScript)(config.graphqlUrlMatch, config.sandboxWaitMs), tabId);
    if (!auth?.graphqlSeen && !Object.keys(auth?.headers ?? {}).length) {
        throw new Error("No GraphQL traffic captured. Open a logged-in app page that calls your API, interact with it, then retry.");
    }
    return {
        headers: auth?.headers ?? {},
        graphqlSeen: auth?.graphqlSeen
    };
}
async function fillSandbox(browser, viewId) {
    const config = getConfig();
    const tabId = await (0, browser_1.ensureBrowserTab)(browser, config.graphqlUrl, viewId);
    const auth = await browser.executeJavaScript(`JSON.parse(sessionStorage.getItem('__apolloAuth')||'{"headers":{}}')`, tabId);
    const iframeUrl = (0, sandbox_1.buildSandboxIframeUrl)(config.graphqlUrl, { headers: auth?.headers ?? {} }, config.defaultOperation, config.defaultVariablesJson);
    const result = await browser.executeJavaScript((0, sandbox_1.buildFillSandboxScript)(iframeUrl, config.sandboxWaitMs), tabId);
    if (result?.err) {
        throw new Error(result.err);
    }
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
    if (!keys.length) {
        return auth.graphqlSeen
            ? "Captured GraphQL session (cookie auth — no extra headers)."
            : "Captured GraphQL session.";
    }
    const authKey = keys.find((k) => /^authorization$/i.test(k));
    if (authKey) {
        return `Captured ${keys.length} header(s) including Authorization.`;
    }
    return `Captured ${keys.length} header(s): ${keys.slice(0, 4).join(", ")}${keys.length > 4 ? "…" : ""}`;
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
            title: "Apollo Sandbox: capturing GraphQL headers…"
        }, async () => {
            const auth = await captureAuth(browser);
            vscode.window.showInformationMessage(headerSummary(auth));
        });
    }), vscode.commands.registerCommand("apolloSandbox.fillSandbox", async () => {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Apollo Sandbox: filling operation, variables, headers…"
        }, async () => {
            await fillSandbox(browser);
            vscode.window.showInformationMessage("Apollo Sandbox filled (formatted operation, variables, headers).");
        });
    }), vscode.commands.registerCommand("apolloSandbox.runOperation", async () => {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Apollo Sandbox: running operation…"
        }, async () => {
            const { data, ms } = await runOperation(browser);
            const preview = data
                ? JSON.stringify(data).slice(0, 120)
                : "see Response panel";
            vscode.window.showInformationMessage(`OK (${ms}ms): ${preview}`);
        });
    }), vscode.commands.registerCommand("apolloSandbox.setupSandbox", async () => {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Apollo Sandbox: setup…"
        }, async () => {
            await captureAuth(browser);
            await fillSandbox(browser);
            vscode.window.showInformationMessage("Apollo Sandbox ready — operation, variables, and headers applied.");
        });
    }), vscode.commands.registerCommand("apolloSandbox.runExport", async () => {
        await vscode.commands.executeCommand("apolloSandbox.runOperation");
    }), vscode.commands.registerCommand("apolloSandbox.setupExportTemplate", async () => {
        await vscode.commands.executeCommand("apolloSandbox.setupSandbox");
    }));
}
function deactivate() { }
//# sourceMappingURL=extension.js.map