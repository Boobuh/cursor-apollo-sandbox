"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isGraphqlEndpointUrl = isGraphqlEndpointUrl;
exports.normalizeGraphqlEndpointUrl = normalizeGraphqlEndpointUrl;
exports.resolveSandboxConfig = resolveSandboxConfig;
const browser_utils_1 = require("../browser.utils");
const sandbox_1 = require("./sandbox");
/** True when the tab URL looks like an Apollo / GraphQL HTTP endpoint page. */
function isGraphqlEndpointUrl(raw) {
    try {
        const { pathname } = new URL(raw);
        return /\/graphql\/?$/i.test(pathname) || pathname.toLowerCase().includes("/graphql");
    }
    catch {
        return false;
    }
}
/** Strip hash/query; keep origin + path as the GraphQL POST URL. */
function normalizeGraphqlEndpointUrl(raw) {
    const url = new URL(raw);
    url.hash = "";
    url.search = "";
    let path = url.pathname.replace(/\/+$/, "") || "/";
    if (!path.toLowerCase().includes("graphql")) {
        path = `${path}/graphql`.replace(/\/{2,}/g, "/");
    }
    url.pathname = path;
    return url.toString();
}
async function resolveSandboxConfig(browser, base) {
    if (!base.graphqlUrlFromBrowserTab) {
        return withDerivedMatch(base, "settings");
    }
    const ctx = await browser.getEnrichedTabContext();
    const candidates = [];
    const push = (url) => {
        if (!url || !(0, browser_utils_1.tabUrlHasGraphqlPath)(url))
            return;
        if (!candidates.includes(url))
            candidates.push(url);
    };
    if (ctx.lastInteractedViewId) {
        push(ctx.tabs.find((t) => t.viewId === ctx.lastInteractedViewId)?.url);
    }
    if (ctx.activeViewId && ctx.activeViewId !== ctx.lastInteractedViewId) {
        push(ctx.tabs.find((t) => t.viewId === ctx.activeViewId)?.url);
    }
    for (const tab of ctx.tabs) {
        push(tab.url);
    }
    const picked = candidates[0];
    if (!picked) {
        return withDerivedMatch(base, "settings");
    }
    const graphqlUrl = normalizeGraphqlEndpointUrl(picked);
    return withDerivedMatch({
        ...base,
        graphqlUrl,
        graphqlUrlMatch: base.graphqlUrlMatch.trim() || (0, sandbox_1.deriveGraphqlUrlMatch)(graphqlUrl)
    }, "browserTab");
}
function withDerivedMatch(config, source) {
    return {
        ...config,
        graphqlUrlSource: source,
        graphqlUrlMatch: config.graphqlUrlMatch.trim() || (0, sandbox_1.deriveGraphqlUrlMatch)(config.graphqlUrl)
    };
}
//# sourceMappingURL=graphql-url.js.map