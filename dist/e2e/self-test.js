"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runCursorBrowserSelfTests = runCursorBrowserSelfTests;
exports.summarizeSelfTestResults = summarizeSelfTestResults;
const GRAPHQL = process.env.APOLLO_E2E_GRAPHQL_URL ?? "http://localhost:3001/graphql";
async function hasCursorBrowserApi(commands) {
    if (commands.getCommands) {
        const list = await commands.getCommands(true);
        return list.some((id) => id.startsWith("cursor.browserView."));
    }
    try {
        await commands.executeCommand("cursor.browserView.listTabs");
        return true;
    }
    catch {
        return false;
    }
}
async function listCommands(commands) {
    if (commands.getCommands) {
        return commands.getCommands(true);
    }
    return [];
}
async function runCase(name, fn, skipIf) {
    try {
        if (skipIf && (await skipIf())) {
            return { name, ok: true, skipped: true };
        }
        await fn();
        return { name, ok: true };
    }
    catch (err) {
        return {
            name,
            ok: false,
            error: err instanceof Error ? err.message : String(err)
        };
    }
}
/** Real Cursor browser API checks — runs inside the extension host. */
async function runCursorBrowserSelfTests(commands) {
    const results = [];
    const skipWithoutBrowser = async () => !(await hasCursorBrowserApi(commands));
    results.push(await runCase("cursor.browserView.listTabs", async () => {
        const result = (await commands.executeCommand("cursor.browserView.listTabs"));
        if (!result || !Array.isArray(result.tabs)) {
            throw new Error("listTabs did not return tabs array");
        }
    }, skipWithoutBrowser));
    results.push(await runCase("executeJavaScript without viewId", async () => {
        const viewId = (await commands.executeCommand("cursor.browserView.newTab", "about:blank"));
        if (!viewId)
            throw new Error("newTab returned no viewId");
        await commands.executeCommand("cursor.browserView.selectTab", viewId);
        await new Promise((r) => setTimeout(r, 800));
        const title = (await commands.executeCommand("cursor.browserView.executeJavaScript", "document.title"));
        if (typeof title !== "string") {
            throw new Error("executeJavaScript did not return string");
        }
    }, skipWithoutBrowser));
    results.push(await runCase("navigate active view without viewId", async () => {
        const target = "data:text/html,<html><title>apollo-self-test</title></html>";
        await commands.executeCommand("cursor.browserView.navigate", target);
        await new Promise((r) => setTimeout(r, 1000));
        const title = (await commands.executeCommand("cursor.browserView.executeJavaScript", "document.title"));
        if (title !== "apollo-self-test") {
            throw new Error(`expected apollo-self-test title, got ${title}`);
        }
    }, skipWithoutBrowser));
    results.push(await runCase("apolloSandbox commands registered", async () => {
        const commandList = await listCommands(commands);
        for (const id of [
            "apolloSandbox.openGraphql",
            "apolloSandbox.captureAuth",
            "apolloSandbox.runOperation"
        ]) {
            if (!commandList.includes(id)) {
                throw new Error(`missing command ${id}`);
            }
        }
    }));
    results.push(await runCase("apolloSandbox.openGraphql opens graphql host tab", async () => {
        await commands.executeCommand("apolloSandbox.openGraphql");
        await new Promise((r) => setTimeout(r, 3000));
        const ctx = (await commands.executeCommand("cursor.browserView.listTabs"));
        const urls = (ctx?.tabs ?? []).map((t) => t.url).filter(Boolean);
        const host = new URL(GRAPHQL).host;
        if (!urls.some((u) => u?.includes(host))) {
            throw new Error(`no tab for ${host}; open tabs: ${urls.join(", ") || "(none)"}`);
        }
    }, skipWithoutBrowser));
    return results;
}
function summarizeSelfTestResults(results) {
    return {
        passed: results.filter((r) => r.ok && !r.skipped).length,
        failed: results.filter((r) => !r.ok).length,
        skipped: results.filter((r) => r.skipped).length
    };
}
//# sourceMappingURL=self-test.js.map