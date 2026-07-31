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
        lmsCatalogUrl: cfg.get("lmsCatalogUrl"),
        graphqlUrl: cfg.get("graphqlUrl"),
        sandboxWaitMs: cfg.get("sandboxWaitMs") ?? 9000
    };
}
async function captureAuth(browser, viewId) {
    const { lmsCatalogUrl } = getConfig();
    const tabId = await (0, browser_1.ensureBrowserTab)(browser, lmsCatalogUrl, viewId);
    await browser.waitForLoad(2000);
    const auth = await browser.executeJavaScript((0, export_template_1.buildCaptureAuthScript)(), tabId);
    if (!auth?.authorization) {
        throw new Error("No Bearer token captured. Log into LMS in the Cursor browser tab, then retry.");
    }
    return auth;
}
async function fillSandbox(browser, viewId) {
    const { graphqlUrl, sandboxWaitMs } = getConfig();
    const tabId = await (0, browser_1.ensureBrowserTab)(browser, graphqlUrl, viewId);
    const auth = await browser.executeJavaScript(`JSON.parse(sessionStorage.getItem('__apolloAuth')||'null')`, tabId);
    if (!auth?.authorization) {
        throw new Error("No auth in sessionStorage. Run “Capture LMS Auth” first.");
    }
    const iframeUrl = (0, export_template_1.buildSandboxIframeUrl)(graphqlUrl, auth);
    const result = await browser.executeJavaScript((0, export_template_1.buildFillSandboxScript)(iframeUrl, sandboxWaitMs), tabId);
    if (result?.err) {
        throw new Error(result.err);
    }
}
async function runExport(browser, viewId) {
    const { graphqlUrl } = getConfig();
    const tabId = await (0, browser_1.ensureBrowserTab)(browser, graphqlUrl, viewId);
    const result = await browser.executeJavaScript((0, export_template_1.buildRunExportScript)(), tabId);
    if (result?.err) {
        throw new Error(result.err);
    }
    if (result?.errors?.length) {
        throw new Error(result.errors.join("; "));
    }
    if (!result?.hasUrl) {
        throw new Error("Export did not return a URL");
    }
    return { urlPrefix: result.urlPrefix, ms: result.ms };
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
            title: "Apollo Sandbox: capturing LMS auth…"
        }, async () => {
            const auth = await captureAuth(browser);
            vscode.window.showInformationMessage(`Captured Bearer for company ${auth["x-company-id"]?.slice(0, 8) ?? "?"}…`);
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
            title: "Apollo Sandbox: running export…"
        }, async () => {
            const { urlPrefix, ms } = await runExport(browser);
            vscode.window.showInformationMessage(`Export OK (${ms}ms): ${urlPrefix ?? "see browser Response panel"}`);
        });
    }), vscode.commands.registerCommand("apolloSandbox.setupExportTemplate", async () => {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Apollo Sandbox: setup export template…"
        }, async () => {
            await captureAuth(browser);
            await fillSandbox(browser);
            vscode.window.showInformationMessage("Apollo Sandbox ready — ExportImportTemplate with auth headers.");
        });
    }));
}
function deactivate() { }
//# sourceMappingURL=extension.js.map