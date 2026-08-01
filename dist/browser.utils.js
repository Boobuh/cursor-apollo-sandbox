"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isBrowserViewError = isBrowserViewError;
exports.browserTabMatchesUrl = browserTabMatchesUrl;
exports.normalizePath = normalizePath;
exports.tabUrlHasGraphqlPath = tabUrlHasGraphqlPath;
exports.isSelectableViewId = isSelectableViewId;
exports.normalizeBrowserTab = normalizeBrowserTab;
exports.normalizeBrowserTabs = normalizeBrowserTabs;
exports.parseListTabsResult = parseListTabsResult;
exports.augmentContextWithActiveView = augmentContextWithActiveView;
exports.collectGraphqlHosts = collectGraphqlHosts;
exports.tabMatchesAuthCaptureHost = tabMatchesAuthCaptureHost;
exports.findAuthCaptureTabsInContext = findAuthCaptureTabsInContext;
exports.isGraphqlBrowserTab = isGraphqlBrowserTab;
exports.findTabByUrlInContext = findTabByUrlInContext;
exports.findTabByHostInContext = findTabByHostInContext;
exports.findAllTabsByHostInContext = findAllTabsByHostInContext;
exports.findGraphqlTabsInContext = findGraphqlTabsInContext;
exports.collectCandidateViewIds = collectCandidateViewIds;
const browser_types_1 = require("./browser.types");
function isBrowserViewError(err) {
    const msg = err instanceof Error ? err.message : String(err);
    return browser_types_1.BROWSER_VIEW_ERROR_MARKERS.some((m) => msg.includes(m));
}
function browserTabMatchesUrl(current, expected) {
    try {
        const a = new URL(current);
        const b = new URL(expected);
        return (a.host === b.host &&
            normalizePath(a.pathname) === normalizePath(b.pathname));
    }
    catch {
        return false;
    }
}
function normalizePath(pathname) {
    return pathname.replace(/\/+$/, "") || "/";
}
function tabUrlHasGraphqlPath(url) {
    if (!url)
        return false;
    return url.toLowerCase().includes("/graphql");
}
function isSelectableViewId(viewId) {
    return Boolean(viewId && !viewId.startsWith("__index_"));
}
function normalizeBrowserTab(raw, index) {
    if (!raw || typeof raw !== "object")
        return undefined;
    const record = raw;
    const viewId = [record.viewId, record.id, record.tabId, record.view_id].find((value) => typeof value === "string" && value.length > 0);
    const url = typeof record.url === "string"
        ? record.url
        : typeof record.href === "string"
            ? record.href
            : undefined;
    const title = typeof record.title === "string" ? record.title : undefined;
    if (!viewId && !url && !title)
        return undefined;
    return {
        viewId: viewId ?? `__index_${index}`,
        url,
        title
    };
}
function normalizeBrowserTabs(raw) {
    if (!Array.isArray(raw))
        return [];
    const tabs = [];
    for (let index = 0; index < raw.length; index += 1) {
        const tab = normalizeBrowserTab(raw[index], index);
        if (tab)
            tabs.push(tab);
    }
    return tabs;
}
function pickOptionalString(value) {
    return typeof value === "string" && value.length > 0 ? value : undefined;
}
/** Normalize cursor.browserView.listTabs payloads across Cursor versions. */
function parseListTabsResult(raw) {
    if (Array.isArray(raw)) {
        return { tabs: normalizeBrowserTabs(raw) };
    }
    if (!raw || typeof raw !== "object") {
        return { tabs: [] };
    }
    const record = raw;
    const tabs = normalizeBrowserTabs(record.tabs ?? record.views ?? record.browserTabs ?? record.items);
    return {
        tabs,
        activeViewId: pickOptionalString(record.activeViewId ?? record.activeId ?? record.activeTabId),
        lastInteractedViewId: pickOptionalString(record.lastInteractedViewId ??
            record.lastActiveViewId ??
            record.lastInteractedTabId)
    };
}
/** When listTabs is empty, synthesize a tab from the active browser view URL. */
function augmentContextWithActiveView(ctx, activeUrl) {
    if (!activeUrl)
        return ctx;
    const activeTab = {
        viewId: browser_types_1.ACTIVE_VIEW_ID,
        url: activeUrl
    };
    if (!ctx.tabs.length) {
        return {
            tabs: [activeTab],
            activeViewId: browser_types_1.ACTIVE_VIEW_ID,
            lastInteractedViewId: browser_types_1.ACTIVE_VIEW_ID
        };
    }
    const alreadyListed = ctx.tabs.some((tab) => tab.url === activeUrl || tab.viewId === browser_types_1.ACTIVE_VIEW_ID);
    if (alreadyListed) {
        return {
            ...ctx,
            activeViewId: ctx.activeViewId ?? browser_types_1.ACTIVE_VIEW_ID,
            lastInteractedViewId: ctx.lastInteractedViewId ?? browser_types_1.ACTIVE_VIEW_ID
        };
    }
    return {
        ...ctx,
        tabs: [activeTab, ...ctx.tabs],
        activeViewId: browser_types_1.ACTIVE_VIEW_ID,
        lastInteractedViewId: ctx.lastInteractedViewId ?? browser_types_1.ACTIVE_VIEW_ID
    };
}
function collectGraphqlHosts(graphqlUrl, authCaptureUrl) {
    const hosts = new Set();
    for (const raw of [graphqlUrl, authCaptureUrl?.trim()]) {
        if (!raw)
            continue;
        try {
            hosts.add(new URL(raw).hostname.toLowerCase());
        }
        catch {
            /* ignore invalid URL */
        }
    }
    return hosts;
}
function tabMatchesAuthCaptureHost(tab, hosts) {
    if (!tab.url)
        return true;
    try {
        return hosts.has(new URL(tab.url).hostname.toLowerCase());
    }
    catch {
        return false;
    }
}
function findAuthCaptureTabsInContext(ctx, graphqlUrl, authCaptureUrl) {
    const hosts = collectGraphqlHosts(graphqlUrl, authCaptureUrl);
    if (!hosts.size)
        return [];
    const score = (tab) => {
        let value = 0;
        if (tab.viewId === ctx.lastInteractedViewId)
            value += 100;
        if (tab.viewId === ctx.activeViewId)
            value += 50;
        return value;
    };
    return ctx.tabs
        .filter((tab) => isSelectableViewId(tab.viewId) &&
        !tabUrlHasGraphqlPath(tab.url) &&
        tabMatchesAuthCaptureHost(tab, hosts))
        .sort((a, b) => score(b) - score(a));
}
function isGraphqlBrowserTab(tab) {
    return tabUrlHasGraphqlPath(tab.url);
}
function findTabByUrlInContext(ctx, url) {
    let target;
    try {
        target = new URL(url);
    }
    catch {
        return undefined;
    }
    const path = normalizePath(target.pathname);
    const matches = (tabUrl) => {
        if (!tabUrl)
            return false;
        try {
            const u = new URL(tabUrl);
            return u.host === target.host && normalizePath(u.pathname) === path;
        }
        catch {
            return false;
        }
    };
    for (const id of [ctx.lastInteractedViewId, ctx.activeViewId]) {
        const tab = ctx.tabs.find((t) => t.viewId === id);
        if (tab && matches(tab.url))
            return tab;
    }
    return ctx.tabs.find((t) => matches(t.url));
}
function findTabByHostInContext(ctx, host) {
    return findAllTabsByHostInContext(ctx, host)[0];
}
function findAllTabsByHostInContext(ctx, host) {
    const hostLower = host.toLowerCase();
    const matchesHost = (tab) => {
        const url = tab.url?.toLowerCase() ?? "";
        return url.includes(hostLower);
    };
    const seen = new Set();
    const ordered = [];
    const push = (tab) => {
        if (!tab?.viewId || seen.has(tab.viewId) || !matchesHost(tab))
            return;
        seen.add(tab.viewId);
        ordered.push(tab);
    };
    for (const id of [ctx.lastInteractedViewId, ctx.activeViewId]) {
        push(ctx.tabs.find((t) => t.viewId === id));
    }
    for (const tab of ctx.tabs) {
        push(tab);
    }
    return ordered;
}
function findGraphqlTabsInContext(ctx, targetUrl) {
    const preferredHost = targetUrl
        ? safeUrlHost(targetUrl)?.toLowerCase()
        : undefined;
    const score = (tab) => {
        let value = 0;
        if (preferredHost && tab.url?.toLowerCase().includes(preferredHost)) {
            value += 200;
        }
        if (tab.viewId === ctx.lastInteractedViewId)
            value += 100;
        if (tab.viewId === ctx.activeViewId)
            value += 50;
        return value;
    };
    return ctx.tabs
        .filter((tab) => tab.viewId && isGraphqlBrowserTab(tab))
        .sort((a, b) => score(b) - score(a));
}
function collectCandidateViewIds(ctx, options) {
    const seen = new Set();
    const ids = [];
    const push = (id) => {
        if (!isSelectableViewId(id) || seen.has(id))
            return;
        seen.add(id);
        ids.push(id);
    };
    push(options.hintViewId);
    push(browser_types_1.ACTIVE_VIEW_ID);
    push(ctx.activeViewId);
    push(ctx.lastInteractedViewId);
    if (options.allowNonGraphqlTab && options.targetUrl) {
        for (const tab of findAuthCaptureTabsInContext(ctx, options.targetUrl, options.authCaptureUrl)) {
            push(tab.viewId);
        }
    }
    for (const tab of findGraphqlTabsInContext(ctx, options.targetUrl)) {
        push(tab.viewId);
    }
    for (const tab of ctx.tabs) {
        if (tab.url || !tab.title?.toLowerCase().includes("apollo"))
            continue;
        push(tab.viewId);
    }
    if (options.targetUrl) {
        const tab = findTabByUrlInContext(ctx, options.targetUrl);
        push(tab?.viewId);
        const host = safeUrlHost(options.targetUrl);
        if (host) {
            for (const t of findAllTabsByHostInContext(ctx, host)) {
                push(t.viewId);
            }
        }
    }
    for (const tab of ctx.tabs) {
        push(tab.viewId);
    }
    return ids;
}
function safeUrlHost(url) {
    try {
        return new URL(url).host;
    }
    catch {
        return undefined;
    }
}
//# sourceMappingURL=browser.utils.js.map