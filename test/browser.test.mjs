import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CursorBrowser } from "../dist/browser.js";
import { createMockCommands } from "./helpers/mock-browser.mjs";

const GRAPHQL = "https://dev.com/graphql";

function listTabsHandler(ctx) {
  return () => ctx;
}

describe("CursorBrowser.runInTab", () => {
  it("selects tab by URL and runs script on active view", async () => {
    const ctx = {
      tabs: [{ viewId: "tab-1", url: GRAPHQL }],
      activeViewId: "tab-1",
      lastInteractedViewId: "tab-1"
    };
    const { commands } = createMockCommands({
      "cursor.browserView.listTabs": listTabsHandler(ctx),
      "cursor.browserView.selectTab": () => ({ success: true }),
      "cursor.browserView.getURL": () => GRAPHQL,
      "cursor.browserView.executeJavaScript": (script) => ({ script })
    });
    const browser = new CursorBrowser(commands);

    const result = await browser.runInTab("return 42", { targetUrl: GRAPHQL });
    assert.deepEqual(result, { script: "return 42" });
  });

  it("retries via ensureBrowserTab after browser view error", async () => {
    let execCount = 0;
    const ctx = {
      tabs: [{ viewId: "tab-1", url: GRAPHQL }],
      activeViewId: "tab-1"
    };
    const { commands, calls } = createMockCommands({
      "cursor.browserView.listTabs": listTabsHandler(ctx),
      "cursor.browserView.selectTab": () => ({ success: true }),
      "cursor.browserView.getURL": () => GRAPHQL,
      "cursor.browserView.navigate": () => undefined,
      "cursor.browserView.executeJavaScript": () => {
        execCount += 1;
        if (execCount === 1) {
          throw new Error("Browser view not found");
        }
        return { ok: true };
      }
    });
    const browser = new CursorBrowser(commands);

    const result = await browser.runInTab("probe", { targetUrl: GRAPHQL });
    assert.deepEqual(result, { ok: true });
    assert.equal(execCount, 2, "should retry script after ensureBrowserTab");
    assert.ok(
      calls.filter((c) => c.cmd === "cursor.browserView.executeJavaScript").length >= 2
    );
  });

  it("throws helpful error when browser view fails without targetUrl", async () => {
    const { commands } = createMockCommands({
      "cursor.browserView.listTabs": () => ({
        tabs: [],
        activeViewId: undefined
      }),
      "cursor.browserView.getURL": () => undefined,
      "cursor.browserView.executeJavaScript": () => {
        throw new Error("Browser view not found");
      }
    });
    const browser = new CursorBrowser(commands);

    await assert.rejects(
      () => browser.runInTab("x", {}),
      /Focus a logged-in tab/
    );
  });
  it("runs script on active view when listTabs is empty but getURL works", async () => {
    const { commands } = createMockCommands({
      "cursor.browserView.listTabs": () => ({ tabs: [] }),
      "cursor.browserView.getURL": () => GRAPHQL,
      "cursor.browserView.executeJavaScript": (script) => ({ script })
    });
    const browser = new CursorBrowser(commands);

    const result = await browser.runInTab("return 42", { targetUrl: GRAPHQL });
    assert.deepEqual(result, { script: "return 42" });
  });

  it("navigates active view to graphql when navigateToTargetUrl is set", async () => {
    const { commands, calls } = createMockCommands({
      "cursor.browserView.listTabs": () => ({ tabs: [] }),
      "cursor.browserView.getURL": () => "https://dev.com/en/app",
      "cursor.browserView.navigate": () => undefined,
      "cursor.browserView.executeJavaScript": () => {
        throw new Error("Browser view not found");
      }
    });
    const browser = new CursorBrowser(commands);

    await assert.rejects(
      () =>
        browser.runInTab("x", {
          targetUrl: GRAPHQL,
          navigateToTargetUrl: true
        }),
      /Focus a logged-in tab/
    );
    assert.ok(calls.some((c) => c.cmd === "cursor.browserView.navigate"));
  });
});

describe("CursorBrowser.ensureBrowserTab", () => {
  it("reuses tab when URL already matches", async () => {
    const ctx = {
      tabs: [{ viewId: "tab-1", url: GRAPHQL }],
      activeViewId: "tab-1"
    };
    const { commands, calls } = createMockCommands({
      "cursor.browserView.listTabs": listTabsHandler(ctx),
      "cursor.browserView.selectTab": () => ({ success: true }),
      "cursor.browserView.getURL": () => GRAPHQL
    });
    const browser = new CursorBrowser(commands);

    await browser.ensureBrowserTab(GRAPHQL);

    assert.ok(!calls.some((c) => c.cmd === "cursor.browserView.navigate"));
    assert.ok(!calls.some((c) => c.cmd === "cursor.browserView.newTab"));
  });

  it("opens new tab when no match exists", async () => {
    const { commands, calls } = createMockCommands({
      "cursor.browserView.listTabs": () => ({ tabs: [] }),
      "cursor.browserView.newTab": () => "new-tab-id"
    });
    const browser = new CursorBrowser(commands);

    await browser.ensureBrowserTab(GRAPHQL, { createIfMissing: true });

    assert.ok(calls.some((c) => c.cmd === "cursor.browserView.newTab"));
    assert.equal(
      calls.find((c) => c.cmd === "cursor.browserView.newTab")?.args[0],
      GRAPHQL
    );
  });

  it("navigates host-matched tab when path differs", async () => {
    const ctx = {
      tabs: [{ viewId: "tab-1", url: "https://dev.com/dashboard" }],
      activeViewId: "tab-1"
    };
    const { commands, calls } = createMockCommands({
      "cursor.browserView.listTabs": listTabsHandler(ctx),
      "cursor.browserView.selectTab": () => ({ success: true }),
      "cursor.browserView.navigate": () => undefined
    });
    const browser = new CursorBrowser(commands);

    await browser.ensureBrowserTab(GRAPHQL);

    assert.ok(calls.some((c) => c.cmd === "cursor.browserView.navigate"));
    assert.equal(
      calls.find((c) => c.cmd === "cursor.browserView.navigate")?.args[0],
      GRAPHQL
    );
  });
});

describe("CursorBrowser.getTabContext", () => {
  it("normalizes listTabs response", async () => {
    const { commands } = createMockCommands({
      "cursor.browserView.listTabs": () => ({
        tabs: [{ viewId: "a", url: "https://x.com" }],
        activeViewId: "a",
        lastInteractedViewId: "b"
      })
    });
    const browser = new CursorBrowser(commands);
    const ctx = await browser.getTabContext();
    assert.equal(ctx.tabs.length, 1);
    assert.equal(ctx.activeViewId, "a");
    assert.equal(ctx.lastInteractedViewId, "b");
  });
});

describe("CursorBrowser.getEnrichedTabContext", () => {
  it("probes tabs missing URLs via selectTab and getURL", async () => {
    const ctx = {
      tabs: [
        { viewId: "tab-1", title: "Apollo Server" },
        { viewId: "tab-2", url: "https://dev.com/dashboard" }
      ],
      activeViewId: "tab-1"
    };
    const { commands } = createMockCommands({
      "cursor.browserView.listTabs": listTabsHandler(ctx),
      "cursor.browserView.selectTab": () => ({ success: true }),
      "cursor.browserView.getURL": () => GRAPHQL
    });
    const browser = new CursorBrowser(commands);

    const enriched = await browser.getEnrichedTabContext();
    assert.equal(enriched.tabs[0]?.url, GRAPHQL);
  });

  it("runs script on graphql tab discovered after URL probe", async () => {
    const ctx = {
      tabs: [{ viewId: "tab-1", title: "Apollo Server" }],
      activeViewId: "tab-1"
    };
    const { commands } = createMockCommands({
      "cursor.browserView.listTabs": listTabsHandler(ctx),
      "cursor.browserView.selectTab": () => ({ success: true }),
      "cursor.browserView.getURL": () => GRAPHQL,
      "cursor.browserView.executeJavaScript": (script) => ({ script })
    });
    const browser = new CursorBrowser(commands);

    const result = await browser.runInTab("return 42", { targetUrl: GRAPHQL });
    assert.deepEqual(result, { script: "return 42" });
  });
});
