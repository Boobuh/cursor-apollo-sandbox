"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CursorBrowser = void 0;
exports.ensureBrowserTab = ensureBrowserTab;
/** Thin wrapper around Cursor's built-in embedded browser commands. */
class CursorBrowser {
    commands;
    constructor(commands) {
        this.commands = commands;
    }
    async listTabs() {
        const result = (await this.commands.executeCommand("cursor.browserView.listTabs"));
        return result?.tabs ?? [];
    }
    async resolveViewId(preferredUrl) {
        const tabs = await this.listTabs();
        if (preferredUrl) {
            const match = tabs.find((t) => t.url?.includes(preferredUrl));
            if (match)
                return match.viewId;
        }
        const list = (await this.commands.executeCommand("cursor.browserView.listTabs"));
        return list?.lastInteractedViewId ?? list?.activeViewId ?? tabs[0]?.viewId;
    }
    async newTab(url) {
        const viewId = (await this.commands.executeCommand("cursor.browserView.newTab", url));
        return viewId;
    }
    async navigate(url, viewId) {
        await this.commands.executeCommand("cursor.browserView.navigate", url, viewId);
    }
    async getUrl(viewId) {
        return (await this.commands.executeCommand("cursor.browserView.getURL", viewId));
    }
    async executeJavaScript(script, viewId) {
        return (await this.commands.executeCommand("cursor.browserView.executeJavaScript", script, viewId));
    }
    async waitForLoad(ms) {
        await new Promise((r) => setTimeout(r, ms));
    }
}
exports.CursorBrowser = CursorBrowser;
async function ensureBrowserTab(browser, url, viewId) {
    if (viewId) {
        await browser.navigate(url, viewId);
        await browser.waitForLoad(1500);
        return viewId;
    }
    const existing = await browser.resolveViewId(new URL(url).host);
    if (existing) {
        await browser.navigate(url, existing);
        await browser.waitForLoad(1500);
        return existing;
    }
    const created = await browser.newTab(url);
    if (!created) {
        throw new Error("Could not open Cursor browser tab");
    }
    await browser.waitForLoad(2500);
    return created;
}
//# sourceMappingURL=browser.js.map