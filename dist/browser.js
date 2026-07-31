"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CursorBrowser = void 0;
const browser_types_1 = require("./browser.types");
const browser_utils_1 = require("./browser.utils");
/**
 * Safe wrapper around Cursor `cursor.browserView.*` commands.
 *
 * NEVER pass viewId to navigate / executeJavaScript / getURL — agent-owned or
 * stale IDs cause "Browser view not found". Use selectTab + active-view commands.
 */
class CursorBrowser {
    commands;
    constructor(commands) {
        this.commands = commands;
    }
    async getTabContext() {
        const result = (await this.commands.executeCommand("cursor.browserView.listTabs"));
        return {
            tabs: result?.tabs ?? [],
            activeViewId: result?.activeViewId,
            lastInteractedViewId: result?.lastInteractedViewId
        };
    }
    async listTabs() {
        return (await this.getTabContext()).tabs;
    }
    async findTabByUrl(url) {
        return (0, browser_utils_1.findTabByUrlInContext)(await this.getTabContext(), url);
    }
    /** selectTab only — safe to pass viewId here. */
    async selectTab(viewId) {
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
    /** Navigate the active / resolved browser view — never pass viewId. */
    async navigateActive(url) {
        await this.commands.executeCommand("cursor.browserView.navigate", url);
    }
    /** Read URL from active / resolved browser view — never pass viewId. */
    async getActiveUrl() {
        try {
            return (await this.commands.executeCommand("cursor.browserView.getURL"));
        }
        catch {
            return undefined;
        }
    }
    /** Run JS in active view — never pass viewId (regression guard). */
    async runScriptInActiveView(script) {
        return (await this.commands.executeCommand("cursor.browserView.executeJavaScript", script));
    }
    async waitForLoad(ms) {
        await new Promise((r) => setTimeout(r, ms));
    }
    /**
     * Focus the best tab for targetUrl / hintViewId, then execute script on the
     * active browser view with fallbacks so "Browser view not found" cannot escape.
     */
    async runInTab(script, options = {}) {
        await this.focusTabForRun(options);
        try {
            return await this.runScriptInActiveView(script);
        }
        catch (err) {
            if (!(0, browser_utils_1.isBrowserViewError)(err))
                throw err;
        }
        if (options.targetUrl) {
            await this.ensureBrowserTab(options.targetUrl);
            return await this.runScriptInActiveView(script);
        }
        throw new Error(`Cursor browser unavailable. ${browser_types_1.BROWSER_TAB_HELP}`);
    }
    async focusTabForRun(options) {
        const ctx = await this.getTabContext();
        if (options.targetUrl) {
            const byUrl = (0, browser_utils_1.findTabByUrlInContext)(ctx, options.targetUrl);
            if (byUrl && (await this.selectTab(byUrl.viewId))) {
                await this.waitForLoad(400);
                return;
            }
        }
        if (options.hintViewId && (await this.selectTab(options.hintViewId))) {
            await this.waitForLoad(400);
            return;
        }
        if (options.targetUrl) {
            const host = safeHost(options.targetUrl);
            if (host) {
                const byHost = (0, browser_utils_1.findTabByHostInContext)(ctx, host);
                if (byHost && (await this.selectTab(byHost.viewId))) {
                    await this.waitForLoad(400);
                }
            }
        }
    }
    /**
     * Ensure a browser tab shows `url`. Never passes viewId to navigate/getURL.
     */
    async ensureBrowserTab(url) {
        const existing = await this.findTabByUrl(url);
        if (existing && (await this.selectTab(existing.viewId))) {
            await this.waitForLoad(500);
            const current = await this.getActiveUrl();
            if (current && (0, browser_utils_1.browserTabMatchesUrl)(current, url)) {
                return;
            }
            try {
                await this.navigateActive(url);
                await this.waitForLoad(1500);
                return;
            }
            catch (err) {
                if (!(0, browser_utils_1.isBrowserViewError)(err))
                    throw err;
            }
        }
        const host = safeHost(url);
        if (host) {
            const byHost = (0, browser_utils_1.findTabByHostInContext)(await this.getTabContext(), host);
            if (byHost && (await this.selectTab(byHost.viewId))) {
                try {
                    await this.navigateActive(url);
                    await this.waitForLoad(1500);
                    return;
                }
                catch (err) {
                    if (!(0, browser_utils_1.isBrowserViewError)(err))
                        throw err;
                }
            }
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