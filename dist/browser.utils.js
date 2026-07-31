"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isBrowserViewError = isBrowserViewError;
exports.browserTabMatchesUrl = browserTabMatchesUrl;
exports.normalizePath = normalizePath;
exports.findTabByUrlInContext = findTabByUrlInContext;
exports.findTabByHostInContext = findTabByHostInContext;
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
    for (const id of [ctx.lastInteractedViewId, ctx.activeViewId]) {
        const tab = ctx.tabs.find((t) => t.viewId === id);
        if (tab?.url?.includes(host))
            return tab;
    }
    return ctx.tabs.find((t) => t.url?.includes(host));
}
//# sourceMappingURL=browser.utils.js.map