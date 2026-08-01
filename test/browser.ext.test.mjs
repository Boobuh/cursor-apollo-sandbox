import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CursorBrowser } from "../dist/browser.js";
import { ACTIVE_VIEW_ID } from "../dist/browser.types.js";
import { createMockCommands } from "./helpers/mock-browser.mjs";

const GRAPHQL = "https://dev.com/graphql";
const APP = "https://dev.com/dashboard";

describe("CursorBrowser error and fallback paths", () => {
  it("getTabContext returns empty tabs when listTabs throws", async () => {
    const { commands } = createMockCommands({
      "cursor.browserView.listTabs": () => {
        throw new Error("listTabs failed");
      }
    });
    const browser = new CursorBrowser(commands);
    const ctx = await browser.getTabContext();
    assert.deepEqual(ctx.tabs, []);
  });

  it("selectTab returns false when selectTab throws", async () => {
    const { commands } = createMockCommands({
      "cursor.browserView.selectTab": () => {
        throw new Error("select failed");
      }
    });
    const browser = new CursorBrowser(commands);
    assert.equal(await browser.selectTab("tab-1"), false);
  });

  it("selectTab treats ACTIVE_VIEW_ID as always selected", async () => {
    const { commands, calls } = createMockCommands({});
    const browser = new CursorBrowser(commands);
    assert.equal(await browser.selectTab(ACTIVE_VIEW_ID), true);
    assert.equal(calls.length, 0);
  });

  it("newTab returns undefined when command throws", async () => {
    const { commands } = createMockCommands({
      "cursor.browserView.newTab": () => {
        throw new Error("newTab failed");
      }
    });
    const browser = new CursorBrowser(commands);
    assert.equal(await browser.newTab(GRAPHQL), undefined);
  });

  it("ensureBrowserTab throws when createIfMissing is false and no tab works", async () => {
    const { commands } = createMockCommands({
      "cursor.browserView.listTabs": () => ({ tabs: [] }),
      "cursor.browserView.getURL": () => undefined,
      "cursor.browserView.navigate": () => {
        throw new Error("navigate failed");
      }
    });
    const browser = new CursorBrowser(commands);
    await assert.rejects(
      () => browser.ensureBrowserTab(GRAPHQL),
      /No usable browser tab/
    );
  });

  it("ensureBrowserTab throws when newTab fails with createIfMissing", async () => {
    const { commands } = createMockCommands({
      "cursor.browserView.listTabs": () => ({ tabs: [] }),
      "cursor.browserView.getURL": () => undefined,
      "cursor.browserView.newTab": () => undefined
    });
    const browser = new CursorBrowser(commands);
    await assert.rejects(
      () => browser.ensureBrowserTab(GRAPHQL, { createIfMissing: true }),
      /Could not open Cursor browser tab/
    );
  });

  it("runInTab with allowNonGraphqlTab executes on active view first", async () => {
    const { commands } = createMockCommands({
      "cursor.browserView.executeJavaScript": () => ({ ok: true })
    });
    const browser = new CursorBrowser(commands);
    const result = await browser.runInTab("script", { allowNonGraphqlTab: true });
    assert.deepEqual(result, { ok: true });
  });

  it("runInTab rethrows non-browser errors from active view", async () => {
    const { commands } = createMockCommands({
      "cursor.browserView.executeJavaScript": () => {
        throw new Error("SyntaxError in script");
      }
    });
    const browser = new CursorBrowser(commands);
    await assert.rejects(
      () => browser.runInTab("bad", { allowNonGraphqlTab: true }),
      /SyntaxError/
    );
  });

  it("runInTab uses graphql tab from enriched context", async () => {
    const ctx = {
      tabs: [
        { viewId: "tab-1", url: APP },
        { viewId: "tab-gql", url: GRAPHQL }
      ],
      activeViewId: "tab-1",
      lastInteractedViewId: "tab-gql"
    };
    const { commands } = createMockCommands({
      "cursor.browserView.listTabs": () => ctx,
      "cursor.browserView.getURL": () => APP,
      "cursor.browserView.selectTab": () => ({ success: true }),
      "cursor.browserView.executeJavaScript": () => ({ ok: true })
    });
    const browser = new CursorBrowser(commands);
    const result = await browser.runInTab("x", { targetUrl: GRAPHQL });
    assert.deepEqual(result, { ok: true });
  });

  it("focusGraphqlTab navigates when active url is not graphql", async () => {
    const { commands, calls } = createMockCommands({
      "cursor.browserView.listTabs": () => ({
        tabs: [{ viewId: "tab-1", url: APP }],
        activeViewId: "tab-1"
      }),
      "cursor.browserView.getURL": () => APP,
      "cursor.browserView.selectTab": () => ({ success: false }),
      "cursor.browserView.navigate": () => undefined
    });
    const browser = new CursorBrowser(commands);
    assert.equal(await browser.focusGraphqlTab(GRAPHQL), true);
    assert.ok(calls.some((c) => c.cmd === "cursor.browserView.navigate"));
  });

  it("focusGraphqlTab returns false when navigation fails", async () => {
    const { commands } = createMockCommands({
      "cursor.browserView.listTabs": () => ({ tabs: [] }),
      "cursor.browserView.getURL": () => APP,
      "cursor.browserView.navigate": () => {
        throw new Error("navigate failed");
      }
    });
    const browser = new CursorBrowser(commands);
    assert.equal(await browser.focusGraphqlTab(GRAPHQL), false);
  });

  it("ensureBrowserTab selects host tab and navigates", async () => {
    const ctx = {
      tabs: [{ viewId: "tab-host", url: "https://dev.com/other" }],
      activeViewId: "tab-host"
    };
    const { commands, calls } = createMockCommands({
      "cursor.browserView.listTabs": () => ctx,
      "cursor.browserView.getURL": () => "https://dev.com/other",
      "cursor.browserView.selectTab": () => ({ success: true }),
      "cursor.browserView.navigate": () => undefined
    });
    const browser = new CursorBrowser(commands);
    await browser.ensureBrowserTab(GRAPHQL, { createIfMissing: true });
    assert.ok(calls.some((c) => c.cmd === "cursor.browserView.navigate"));
  });

  it("ensureBrowserTab reuses graphql tab when focusGraphqlTab succeeds", async () => {
    const ctx = {
      tabs: [{ viewId: "gql", url: GRAPHQL }],
      activeViewId: "gql"
    };
    const { commands, calls } = createMockCommands({
      "cursor.browserView.listTabs": () => ctx,
      "cursor.browserView.getURL": () => GRAPHQL,
      "cursor.browserView.selectTab": () => ({ success: true })
    });
    const browser = new CursorBrowser(commands);
    await browser.ensureBrowserTab(GRAPHQL);
    assert.ok(!calls.some((c) => c.cmd === "cursor.browserView.newTab"));
  });

  it("runInTab succeeds after navigateToTargetUrl on non-graphql active view", async () => {
    const { commands } = createMockCommands({
      "cursor.browserView.listTabs": () => ({ tabs: [] }),
      "cursor.browserView.getURL": () => APP,
      "cursor.browserView.navigate": () => undefined,
      "cursor.browserView.executeJavaScript": () => ({ filled: true })
    });
    const browser = new CursorBrowser(commands);
    const result = await browser.runInTab("fill", {
      targetUrl: GRAPHQL,
      navigateToTargetUrl: true,
      allowNonGraphqlTab: true
    });
    assert.deepEqual(result, { filled: true });
  });
});
