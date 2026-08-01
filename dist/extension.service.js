"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBaseConfig = getBaseConfig;
exports.getResolvedConfig = getResolvedConfig;
exports.resolveSandboxDocument = resolveSandboxDocument;
exports.resolveSandboxVariablesJson = resolveSandboxVariablesJson;
exports.autoDetectHeaders = autoDetectHeaders;
exports.fillSandbox = fillSandbox;
exports.runOperation = runOperation;
exports.runApolloCommand = runApolloCommand;
const browser_types_1 = require("./browser.types");
const browser_utils_1 = require("./browser.utils");
const graphql_url_1 = require("./apollo/graphql-url");
const header_detection_1 = require("./apollo/header-detection");
const sandbox_1 = require("./apollo/sandbox");
function getBaseConfig(api) {
    const cfg = api.workspace.getConfiguration("apolloSandbox");
    const graphqlUrl = cfg.get("graphqlUrl") ?? "http://localhost:4000/graphql";
    const defaultOperation = cfg.get("defaultOperation")?.trim() || sandbox_1.FALLBACK_OPERATION;
    const defaultVariablesRaw = cfg.get("defaultVariables")?.trim() || sandbox_1.FALLBACK_VARIABLES_JSON;
    try {
        (0, sandbox_1.parseVariablesJson)(defaultVariablesRaw);
    }
    catch {
        /* defer invalid-config error until a command runs */
    }
    return {
        authCaptureUrl: cfg.get("authCaptureUrl") ?? "",
        graphqlUrl,
        graphqlUrlFromBrowserTab: cfg.get("graphqlUrlFromBrowserTab") ?? false,
        graphqlUrlMatch: cfg.get("graphqlUrlMatch")?.trim() ?? "",
        sandboxWaitMs: cfg.get("sandboxWaitMs") ?? 12000,
        headerDetectMs: cfg.get("headerDetectMs") ?? 6000,
        defaultOperation,
        defaultVariablesJson: defaultVariablesRaw
    };
}
async function getResolvedConfig(api, browser) {
    return (0, graphql_url_1.resolveSandboxConfig)(browser, getBaseConfig(api));
}
async function runDetectOnTab(browser, detectScript, tabViewId, tabUrl, config, allowNonGraphqlTab) {
    try {
        return await browser.runInTab(detectScript, {
            hintViewId: tabViewId,
            targetUrl: config.graphqlUrl,
            authCaptureUrl: config.authCaptureUrl,
            allowNonGraphqlTab
        });
    }
    catch {
        return undefined;
    }
}
function pickBestTrafficPart(parts) {
    const trafficParts = parts.filter((part) => part.sources?.some(header_detection_1.isTrafficHeaderSource) &&
        Object.keys(part.headers ?? {}).length);
    return [...trafficParts].sort((a, b) => {
        const score = (part) => {
            let value = Object.keys(part.headers ?? {}).length * 10;
            if (part.probeOk)
                value += 100;
            if ((0, header_detection_1.hasRequiredGraphqlAuthHeaders)(part.headers ?? {}))
                value += 200;
            if (part.operation && !(0, header_detection_1.isTrivialProbeQuery)(part.operation))
                value += 150;
            return value;
        };
        return score(b) - score(a);
    })[0];
}
function resolveSandboxDocument(auth, config) {
    const captured = auth.operation?.trim();
    if (captured && !(0, header_detection_1.isTrivialProbeQuery)(captured)) {
        return captured;
    }
    if ((0, header_detection_1.hasRealGraphqlOperation)(auth)) {
        return auth.operation.trim();
    }
    return config.defaultOperation;
}
function resolveSandboxVariablesJson(auth, config) {
    if (auth.operation?.trim() && !(0, header_detection_1.isTrivialProbeQuery)(auth.operation)) {
        return (0, sandbox_1.formatVariablesJson)(auth.variablesJson?.trim() || "{}");
    }
    return (0, sandbox_1.formatVariablesJson)(config.defaultVariablesJson);
}
async function readCachedFromAppTabs(browser, appTabs, cacheScript, config) {
    const cachedParts = [];
    const tabs = appTabs.length
        ? appTabs
        : [{ viewId: undefined }];
    for (const tab of tabs) {
        const cached = await browser.runInTab(cacheScript, {
            hintViewId: tab.viewId,
            allowNonGraphqlTab: true,
            targetUrl: config.graphqlUrl,
            authCaptureUrl: config.authCaptureUrl
        });
        if (cached)
            cachedParts.push(cached);
    }
    return cachedParts;
}
const OPERATION_SEARCH_PASSES = 3;
const OPERATION_SEARCH_PASS_DELAY_MS = 700;
async function autoDetectHeaders(browser, config) {
    const hookScript = (0, header_detection_1.buildInstallPersistentTrafficHookScript)();
    const detectScript = (0, header_detection_1.buildAutoDetectHeadersScript)(config.graphqlUrl, config.graphqlUrlMatch, config.headerDetectMs);
    const cacheScript = (0, header_detection_1.buildReadCachedGraphqlRequestScript)();
    const ctx = await browser.getEnrichedTabContext();
    const parts = [];
    const appTabs = (0, browser_utils_1.findAuthCaptureTabsInContext)(ctx, config.graphqlUrl, config.authCaptureUrl);
    for (const tab of appTabs) {
        await browser.runInTab(hookScript, {
            hintViewId: tab.viewId,
            allowNonGraphqlTab: true,
            targetUrl: config.graphqlUrl,
            authCaptureUrl: config.authCaptureUrl
        });
    }
    if (!appTabs.length) {
        await browser.runInTab(hookScript, {
            allowNonGraphqlTab: true,
            targetUrl: config.graphqlUrl,
            authCaptureUrl: config.authCaptureUrl
        });
    }
    parts.push(...(await readCachedFromAppTabs(browser, appTabs, cacheScript, config)));
    for (let pass = 0; pass < OPERATION_SEARCH_PASSES; pass += 1) {
        for (const tab of appTabs) {
            const result = await runDetectOnTab(browser, detectScript, tab.viewId, tab.url, config, true);
            if (result)
                parts.push(result);
        }
        if (!appTabs.length || !pickBestTrafficPart(parts)) {
            const result = await browser.runInTab(detectScript, {
                targetUrl: config.graphqlUrl,
                authCaptureUrl: config.authCaptureUrl,
                allowNonGraphqlTab: true
            });
            if (result)
                parts.push(result);
        }
        parts.push(...(await readCachedFromAppTabs(browser, appTabs, cacheScript, config)));
        const merged = (0, header_detection_1.mergeTrafficCapture)(...parts);
        if ((0, header_detection_1.hasRealGraphqlOperation)(merged) &&
            Object.keys(merged.headers).length > 0) {
            await browser.runInTab((0, header_detection_1.buildPersistHeadersScript)(merged), {
                targetUrl: config.graphqlUrl,
                navigateToTargetUrl: true
            });
            if (!(0, header_detection_1.hasRequiredGraphqlAuthHeaders)(merged.headers)) {
                merged.sources = [
                    ...new Set([...(merged.sources ?? []), "traffic-partial-headers"])
                ];
            }
            return merged;
        }
        if (pass < OPERATION_SEARCH_PASSES - 1) {
            await browser.waitForLoad(OPERATION_SEARCH_PASS_DELAY_MS);
        }
    }
    const merged = (0, header_detection_1.mergeTrafficCapture)(...parts);
    if (!Object.keys(merged.headers).length) {
        throw new Error("Could not capture headers from GraphQL network traffic. Focus a logged-in tab with at least one graphql POST in Network, then retry Setup.");
    }
    if (!(0, header_detection_1.hasRealGraphqlOperation)(merged)) {
        throw new Error("Could not capture a GraphQL operation from network traffic. Focus a logged-in app tab, trigger an action that sends a graphql POST (not only __typename), then retry Setup.");
    }
    await browser.runInTab((0, header_detection_1.buildPersistHeadersScript)(merged), {
        targetUrl: config.graphqlUrl,
        navigateToTargetUrl: true
    });
    if (!(0, header_detection_1.hasRequiredGraphqlAuthHeaders)(merged.headers)) {
        merged.sources = [
            ...new Set([...(merged.sources ?? []), "traffic-partial-headers"])
        ];
    }
    return merged;
}
async function fillSandbox(browser, config, auth) {
    const operation = resolveSandboxDocument(auth, config);
    const variablesJson = resolveSandboxVariablesJson(auth, config);
    const result = await browser.runInTab((0, sandbox_1.buildFillSandboxScript)(config.graphqlUrl, operation, variablesJson, config.sandboxWaitMs), {
        targetUrl: config.graphqlUrl,
        navigateToTargetUrl: true
    });
    if (result?.err) {
        throw new Error(result.err);
    }
    return result?.headerKeys ?? Object.keys(auth.headers);
}
async function runOperation(browser, config, auth) {
    const operation = auth
        ? resolveSandboxDocument(auth, config)
        : config.defaultOperation;
    const variablesJson = auth
        ? resolveSandboxVariablesJson(auth, config)
        : config.defaultVariablesJson;
    const result = await browser.runInTab((0, sandbox_1.buildRunOperationScript)(config.graphqlUrl, operation, variablesJson), { targetUrl: config.graphqlUrl });
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