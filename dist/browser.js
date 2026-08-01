"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CursorBrowser = void 0;
const browser_types_1 = require("./browser.types");
const browser_utils_1 = require("./browser.utils");
class CursorBrowser {
    commands;
    constructor(commands) {
        this.commands = commands;
    }
    async getTabContext() {
        try {
            const result = await this.commands.executeCommand("cursor.browserView.listTabs");
            return (0, browser_utils_1.parseListTabsResult)(result);
        }
        catch {
            return { tabs: [] };
        }
    }
    /** Fill missing tab URLs and synthesize active view when listTabs is empty. */
    async getEnrichedTabContext() {
        const ctx = await this.getTabContext();
        const activeUrl = await this.getActiveUrl();
        let enriched = (0, browser_utils_1.augmentContextWithActiveView)(ctx, activeUrl);
        if (!enriched.tabs.some((tab) => tab.viewId && !tab.url)) {
            return enriched;
        }
        const tabs = [...enriched.tabs];
        for (let index = 0; index < tabs.length; index += 1) {
            const tab = tabs[index];
            if (!tab.viewId || tab.url || tab.viewId === browser_types_1.ACTIVE_VIEW_ID)
                continue;
            if (!(await this.selectTab(tab.viewId)))
                continue;
            await this.waitForLoad(300);
            const url = await this.getActiveUrl();
            if (url) {
                tabs[index] = { ...tab, url };
            }
        }
        enriched = { ...enriched, tabs };
        return (0, browser_utils_1.augmentContextWithActiveView)(enriched, await this.getActiveUrl());
    }
    async listTabs() {
        return (await this.getEnrichedTabContext()).tabs;
    }
    async findTabByUrl(url) {
        return (0, browser_utils_1.findTabByUrlInContext)(await this.getEnrichedTabContext(), url);
    }
    async selectTab(viewId) {
        if (viewId === browser_types_1.ACTIVE_VIEW_ID) {
            return true;
        }
        try {
            const result = (await this.commands.executeCommand("cursor.browserView.selectTab", viewId));
            return result?.success !== false;
        }
        catch {
            return false;
        }
    }
    async newTab(url) {
        try {
            return (await this.commands.executeCommand("cursor.browserView.newTab", url));
        }
        catch {
            return undefined;
        }
    }
    async navigateActive(url) {
        try {
            await this.commands.executeCommand("cursor.browserView.navigate", url);
            return true;
        }
        catch {
            return false;
        }
    }
    async getActiveUrl() {
        try {
            return (await this.commands.executeCommand("cursor.browserView.getURL"));
        }
        catch {
            return undefined;
        }
    }
    async runScriptInActiveView(script) {
        return (await this.commands.executeCommand("cursor.browserView.executeJavaScript", script));
    }
    async waitForLoad(ms) {
        await new Promise((r) => setTimeout(r, ms));
    }
    async focusGraphqlTab(targetUrl) {
        const ctx = await this.getEnrichedTabContext();
        for (const viewId of (0, browser_utils_1.collectCandidateViewIds)(ctx, { targetUrl })) {
            if (!(await this.selectTab(viewId)))
                continue;
            await this.waitForLoad(600);
            const activeUrl = await this.getActiveUrl();
            if (activeUrl &&
                ((0, browser_utils_1.tabUrlHasGraphqlPath)(activeUrl) ||
                    (0, browser_utils_1.browserTabMatchesUrl)(activeUrl, targetUrl))) {
                return true;
            }
        }
        const activeUrl = await this.getActiveUrl();
        if (activeUrl && !(0, browser_utils_1.tabUrlHasGraphqlPath)(activeUrl)) {
            if (await this.navigateActive(targetUrl)) {
                await this.waitForLoad(1200);
                return true;
            }
        }
        return false;
    }
    async tryRunScriptInCandidates(script, ctx, options) {
        for (const viewId of (0, browser_utils_1.collectCandidateViewIds)(ctx, options)) {
            if (viewId !== browser_types_1.ACTIVE_VIEW_ID && !(await this.selectTab(viewId))) {
                continue;
            }
            await this.waitForLoad(400);
            const activeUrl = await this.getActiveUrl();
            if (!options.allowNonGraphqlTab &&
                options.targetUrl &&
                activeUrl &&
                !(0, browser_utils_1.tabUrlHasGraphqlPath)(activeUrl) &&
                !(0, browser_utils_1.browserTabMatchesUrl)(activeUrl, options.targetUrl)) {
                continue;
            }
            try {
                return await this.runScriptInActiveView(script);
            }
            catch (err) {
                if (!(0, browser_utils_1.isBrowserViewError)(err))
                    throw err;
            }
        }
        return undefined;
    }
    async tryRunScriptOnGraphqlTabs(script, ctx, targetUrl) {
        for (const tab of (0, browser_utils_1.findGraphqlTabsInContext)(ctx, targetUrl)) {
            if (tab.viewId !== browser_types_1.ACTIVE_VIEW_ID && !(await this.selectTab(tab.viewId))) {
                continue;
            }
            await this.waitForLoad(400);
            try {
                return await this.runScriptInActiveView(script);
            }
            catch (err) {
                if (!(0, browser_utils_1.isBrowserViewError)(err))
                    throw err;
            }
        }
        return undefined;
    }
    async formatTabContextError(ctx, targetUrl) {
        const graphqlTabs = (0, browser_utils_1.findGraphqlTabsInContext)(ctx, targetUrl);
        const activeUrl = await this.getActiveUrl();
        const summary = ctx.tabs
            .map((tab) => {
            const label = tab.url ?? tab.title ?? "?";
            return `${tab.viewId}:${label}`;
        })
            .join("; ");
        const activePart = activeUrl ? ` active: ${activeUrl}` : "";
        return `Cursor browser unavailable (${ctx.tabs.length} tab(s), ${graphqlTabs.length} with /graphql${summary ? `: ${summary}` : ""}${activePart}). ${browser_types_1.BROWSER_TAB_HELP}`;
    }
    async tryNavigateToTarget(targetUrl, allowNonGraphqlTab) {
        const activeUrl = await this.getActiveUrl();
        if (activeUrl &&
            ((0, browser_utils_1.tabUrlHasGraphqlPath)(activeUrl) ||
                (0, browser_utils_1.browserTabMatchesUrl)(activeUrl, targetUrl))) {
            return true;
        }
        if (allowNonGraphqlTab) {
            return false;
        }
        if (!(await this.navigateActive(targetUrl))) {
            return false;
        }
        await this.waitForLoad(1200);
        return true;
    }
    async runInTab(script, options = {}) {
        if (options.allowNonGraphqlTab) {
            try {
                return await this.runScriptInActiveView(script);
            }
            catch (err) {
                if (!(0, browser_utils_1.isBrowserViewError)(err))
                    throw err;
            }
        }
        else {
            try {
                const activeUrl = await this.getActiveUrl();
                if (!options.targetUrl ||
                    !activeUrl ||
                    (0, browser_utils_1.tabUrlHasGraphqlPath)(activeUrl) ||
                    (0, browser_utils_1.browserTabMatchesUrl)(activeUrl, options.targetUrl)) {
                    return await this.runScriptInActiveView(script);
                }
            }
            catch (err) {
                if (!(0, browser_utils_1.isBrowserViewError)(err))
                    throw err;
            }
        }
        const ctx = await this.getEnrichedTabContext();
        if (options.allowNonGraphqlTab) {
            const fromApp = await this.tryRunScriptInCandidates(script, ctx, options);
            if (fromApp !== undefined) {
                return fromApp;
            }
        }
        const fromGraphql = await this.tryRunScriptOnGraphqlTabs(script, ctx, options.targetUrl);
        if (fromGraphql !== undefined) {
            return fromGraphql;
        }
        const fromCandidates = await this.tryRunScriptInCandidates(script, ctx, options);
        if (fromCandidates !== undefined) {
            return fromCandidates;
        }
        for (const tab of ctx.tabs) {
            if (!(0, browser_utils_1.isSelectableViewId)(tab.viewId))
                continue;
            if (tab.viewId !== browser_types_1.ACTIVE_VIEW_ID &&
                !(await this.selectTab(tab.viewId))) {
                continue;
            }
            await this.waitForLoad(400);
            const activeUrl = await this.getActiveUrl();
            if (!options.allowNonGraphqlTab &&
                activeUrl &&
                !(0, browser_utils_1.tabUrlHasGraphqlPath)(activeUrl) &&
                options.targetUrl &&
                !(0, browser_utils_1.browserTabMatchesUrl)(activeUrl, options.targetUrl)) {
                continue;
            }
            try {
                return await this.runScriptInActiveView(script);
            }
            catch (err) {
                if (!(0, browser_utils_1.isBrowserViewError)(err))
                    throw err;
            }
        }
        if (options.navigateToTargetUrl &&
            options.targetUrl &&
            (await this.tryNavigateToTarget(options.targetUrl, options.allowNonGraphqlTab))) {
            try {
                return await this.runScriptInActiveView(script);
            }
            catch (err) {
                if (!(0, browser_utils_1.isBrowserViewError)(err))
                    throw err;
            }
        }
        if (!options.allowNonGraphqlTab &&
            options.targetUrl &&
            (await this.focusGraphqlTab(options.targetUrl))) {
            try {
                return await this.runScriptInActiveView(script);
            }
            catch (err) {
                if (!(0, browser_utils_1.isBrowserViewError)(err))
                    throw err;
            }
        }
        throw new Error(await this.formatTabContextError(ctx, options.targetUrl));
    }
    async ensureBrowserTab(url, options = {}) {
        const createIfMissing = options.createIfMissing ?? false;
        if (await this.focusGraphqlTab(url)) {
            const current = await this.getActiveUrl();
            if (!current || !(0, browser_utils_1.browserTabMatchesUrl)(current, url)) {
                if (await this.navigateActive(url)) {
                    await this.waitForLoad(1200);
                }
            }
            return;
        }
        const host = safeHost(url);
        if (host) {
            for (const tab of (0, browser_utils_1.findAllTabsByHostInContext)(await this.getEnrichedTabContext(), host)) {
                if (await this.selectTab(tab.viewId)) {
                    await this.waitForLoad(600);
                    if (await this.navigateActive(url)) {
                        await this.waitForLoad(1200);
                    }
                    return;
                }
            }
        }
        for (const tab of (0, browser_utils_1.findGraphqlTabsInContext)(await this.getEnrichedTabContext(), url)) {
            if (await this.selectTab(tab.viewId)) {
                await this.waitForLoad(600);
                return;
            }
        }
        const activeUrl = await this.getActiveUrl();
        if (activeUrl && (await this.navigateActive(url))) {
            await this.waitForLoad(1200);
            return;
        }
        if (!createIfMissing) {
            throw new Error(`No usable browser tab for ${url}. Focus a logged-in tab with a /graphql request, then retry Setup.`);
        }
        const created = await this.newTab(url);
        if (!created) {
            throw new Error(`Could not open Cursor browser tab. ${browser_types_1.BROWSER_TAB_HELP}`);
        }
        await this.waitForLoad(2500);
    }
}
exports.CursorBrowser = CursorBrowser;
function safeHost(url) {
    try {
        return new URL(url).host;
    }
    catch {
        return undefined;
    }
}
//# sourceMappingURL=browser.js.map