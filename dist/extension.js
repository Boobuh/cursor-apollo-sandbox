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
const export_template_1 = require("./apollo/export-template");
function getConfig() {
    const cfg = vscode.workspace.getConfiguration("apolloSandbox");
    return {
        catalogUrl: cfg.get("catalogUrl") ?? "",
        graphqlUrl: cfg.get("graphqlUrl") ?? "http://localhost:4000/graphql",
        sandboxWaitMs: cfg.get("sandboxWaitMs") ?? 9000
    };
}
async function captureAuth(browser, viewId) {
    const { catalogUrl } = getConfig();
    if (!catalogUrl.trim()) {
        throw new Error("Set apolloSandbox.catalogUrl in Settings (page that triggers /graphql while logged in).");
    }
    const tabId = await (0, browser_1.ensureBrowserTab)(browser, catalogUrl, viewId);
    await browser.waitForLoad(2000);
    const auth = await browser.executeJavaScript((0, export_template_1.buildCaptureAuthScript)(), tabId);
    if (!auth?.authorization) {
        throw new Error("No Bearer token captured. Log into your app in the Cursor browser tab, then retry.");
    }
    return auth;
}
async function fillSandbox(browser, viewId) {
    const { graphqlUrl, sandboxWaitMs } = getConfig();
    const tabId = await (0, browser_1.ensureBrowserTab)(browser, graphqlUrl, viewId);
    const auth = await browser.executeJavaScript(`JSON.parse(sessionStorage.getItem('__apolloAuth')||'null')`, tabId);
    if (!auth?.authorization) {
        throw new Error('No auth in sessionStorage. Run "Capture Auth" first.');
    }
    const iframeUrl = (0, export_template_1.buildSandboxIframeUrl)(graphqlUrl, auth);
    const result = await browser.executeJavaScript((0, export_template_1.buildFillSandboxScript)(iframeUrl, sandboxWaitMs), tabId);
    if (result?.err) {
        throw new Error(result.err);
    }
}
async function runOperation(browser, viewId) {
    const { graphqlUrl } = getConfig();
    const tabId = await (0, browser_1.ensureBrowserTab)(browser, graphqlUrl, viewId);
    const result = await browser.executeJavaScript((0, export_template_1.buildRunOperationScript)(), tabId);
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
function activate(context) {
    const browser = new browser_1.CursorBrowser(vscode.commands);
    context.subscriptions.push(vscode.commands.registerCommand("apolloSandbox.openGraphql", async () => {
        const { graphqlUrl } = getConfig();
        await (0, browser_1.ensureBrowserTab)(browser, graphqlUrl);
        vscode.window.showInformationMessage(`Opened ${graphqlUrl}`);
    }), vscode.commands.registerCommand("apolloSandbox.captureAuth", async () => {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Apollo Sandbox: capturing auth…"
        }, async () => {
            const auth = await captureAuth(browser);
            const companyHint = auth["x-company-id"]?.slice(0, 8);
            vscode.window.showInformationMessage(companyHint
                ? `Captured Bearer (company ${companyHint}…)`
                : "Captured Bearer token.");
        });
    }), vscode.commands.registerCommand("apolloSandbox.fillSandbox", async () => {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Apollo Sandbox: filling operation, variables, headers…"
        }, async () => {
            await fillSandbox(browser);
            vscode.window.showInformationMessage("Apollo Sandbox filled (formatted operation, variables, headers).");
        });
    }), vscode.commands.registerCommand("apolloSandbox.runExport", async () => {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Apollo Sandbox: running operation…"
        }, async () => {
            const { data, ms } = await runOperation(browser);
            const preview = data ? JSON.stringify(data).slice(0, 120) : "see Response panel";
            vscode.window.showInformationMessage(`OK (${ms}ms): ${preview}`);
        });
    }), vscode.commands.registerCommand("apolloSandbox.setupExportTemplate", async () => {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Apollo Sandbox: setup sandbox…"
        }, async () => {
            await captureAuth(browser);
            await fillSandbox(browser);
            vscode.window.showInformationMessage("Apollo Sandbox ready — default operation with auth headers.");
        });
    }));
}
function deactivate() { }
//# sourceMappingURL=extension.js.map