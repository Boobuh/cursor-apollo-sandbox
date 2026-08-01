"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBaseConfig = getBaseConfig;
exports.getResolvedConfig = getResolvedConfig;
exports.autoDetectHeaders = autoDetectHeaders;
exports.fillSandbox = fillSandbox;
exports.runOperation = runOperation;
exports.runApolloCommand = runApolloCommand;
const browser_types_1 = require("./browser.types");
const browser_utils_1 = require("./browser.utils");
const graphql_url_1 = require("./apollo/graphql-url");
const header_detection_1 = require("./apollo/header-detection");
const sandbox_1 = require("./apollo/sandbox");
const extension_helpers_1 = require("./extension.helpers");
function getBaseConfig(api) {
    const cfg = api.workspace.getConfiguration("apolloSandbox");
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
async function getResolvedConfig(api, browser) {
    return (0, graphql_url_1.resolveSandboxConfig)(browser, getBaseConfig(api));
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
async function runApolloCommand(api, title, fn) {
    try {
        await api.window.withProgress({ location: api.ProgressLocation.Notification, title }, fn);
    }
    catch (err) {
        if ((0, browser_utils_1.isBrowserViewError)(err)) {
            api.window.showErrorMessage(`Apollo Sandbox: Cursor browser tab issue. ${browser_types_1.BROWSER_TAB_HELP}`);
            return;
        }
        throw err;
    }
}
//# sourceMappingURL=extension.service.js.map