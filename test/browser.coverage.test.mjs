import { describe, it } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { CursorBrowser } from "../dist/browser.js";
import { ACTIVE_VIEW_ID } from "../dist/browser.types.js";
import { buildReadCachedGraphqlRequestScript } from "../dist/apollo/header-detection.js";
import { createMockCommands } from "./helpers/mock-browser.mjs";

const GRAPHQL = "https://dev.com/graphql";
const APP = "https://dev.com/app";

describe("CursorBrowser coverage paths", () => {
  it("getEnrichedTabContext returns early when every tab has a URL", async () => {
    const { commands } = createMockCommands({
      "cursor.browserView.listTabs": () => ({
        tabs: [{ viewId: "a", url: APP }],
        activeViewId: "a"
      }),
      "cursor.browserView.getURL": () => APP
    });
    const browser = new CursorBrowser(commands);
    const ctx = await browser.getEnrichedTabContext();
    assert.equal(ctx.tabs[0]?.url, APP);
  });

  it("getEnrichedTabContext skips tabs when selectTab fails during URL probe", async () => {
    const { commands } = createMockCommands({
      "cursor.browserView.listTabs": () => ({
        tabs: [
          { viewId: "missing-url", title: "App" },
          { viewId: "has-url", url: "https://dev.com/other" }
        ],
        activeViewId: "missing-url"
      }),
      "cursor.browserView.getURL": () => "https://dev.com/other",
      "cursor.browserView.selectTab": (viewId) => {
        if (viewId === "missing-url") {
          throw new Error("select failed");
        }
        return { success: true };
      }
    });
    const browser = new CursorBrowser(commands);
    const ctx = await browser.getEnrichedTabContext();
    const missing = ctx.tabs.find((tab) => tab.viewId === "missing-url");
    assert.equal(missing?.url, undefined);
  });

  it("runInTab throws formatted error when no tab can run script", async () => {
    const { commands } = createMockCommands({
      "cursor.browserView.listTabs": () => ({ tabs: [] }),
      "cursor.browserView.getURL": () => {
        throw new Error("no url");
      },
      "cursor.browserView.executeJavaScript": () => {
        throw new Error("Browser view not found");
      },
      "cursor.browserView.navigate": () => {
        throw new Error("navigate failed");
      }
    });
    const browser = new CursorBrowser(commands);
    await assert.rejects(
      () => browser.runInTab("x", { targetUrl: GRAPHQL }),
      /Cursor browser unavailable/
    );
  });

  it("focusGraphqlTab succeeds when candidate tab already on graphql", async () => {
    const ctx = {
      tabs: [{ viewId: "gql", url: GRAPHQL }],
      activeViewId: "gql",
      lastInteractedViewId: "gql"
    };
    const { commands } = createMockCommands({
      "cursor.browserView.listTabs": () => ctx,
      "cursor.browserView.selectTab": () => ({ success: true }),
      "cursor.browserView.getURL": () => GRAPHQL
    });
    const browser = new CursorBrowser(commands);
    assert.equal(await browser.focusGraphqlTab(GRAPHQL), true);
  });

  it("tryRunScriptInCandidates skips wrong-host tabs without allowNonGraphqlTab", async () => {
    const ctx = {
      tabs: [{ viewId: "app", url: APP }],
      activeViewId: "app",
      lastInteractedViewId: "app"
    };
    let execCount = 0;
    const { commands } = createMockCommands({
      "cursor.browserView.listTabs": () => ctx,
      "cursor.browserView.getURL": () => APP,
      "cursor.browserView.selectTab": () => ({ success: true }),
      "cursor.browserView.executeJavaScript": () => {
        execCount += 1;
        return { ok: true };
      }
    });
    const browser = new CursorBrowser(commands);
    await assert.rejects(
      () => browser.runInTab("x", { targetUrl: GRAPHQL }),
      /Cursor browser unavailable/
    );
    assert.equal(execCount, 0);
  });

  it("tryRunScriptOnGraphqlTabs swallows browser view errors", async () => {
    const ctx = {
      tabs: [{ viewId: "gql", url: GRAPHQL }],
      activeViewId: "gql"
    };
    const { commands } = createMockCommands({
      "cursor.browserView.listTabs": () => ctx,
      "cursor.browserView.selectTab": () => ({ success: true }),
      "cursor.browserView.getURL": () => APP,
      "cursor.browserView.executeJavaScript": () => {
        throw new Error("Browser view not found");
      }
    });
    const browser = new CursorBrowser(commands);
    await assert.rejects(() => browser.runInTab("x", { targetUrl: GRAPHQL }), /Cursor browser unavailable/);
  });

  it("formatTabContextError includes tab summary and active url", async () => {
    const ctx = {
      tabs: [{ viewId: "t1", title: "Apollo Server" }],
      activeViewId: "t1"
    };
    const { commands } = createMockCommands({
      "cursor.browserView.listTabs": () => ctx,
      "cursor.browserView.getURL": () => APP,
      "cursor.browserView.selectTab": () => ({ success: false })
    });
    const browser = new CursorBrowser(commands);
    await assert.rejects(
      () => browser.runInTab("x", { targetUrl: GRAPHQL }),
      /t1:Apollo Server active: https:\/\/dev.com\/app/
    );
  });

  it("runInTab iterates apollo-titled tabs without URLs", async () => {
    const ctx = {
      tabs: [{ viewId: "apollo-title", title: "Apollo Server Sandbox" }],
      activeViewId: "apollo-title"
    };
    const { commands } = createMockCommands({
      "cursor.browserView.listTabs": () => ctx,
      "cursor.browserView.getURL": () => GRAPHQL,
      "cursor.browserView.selectTab": () => ({ success: true }),
      "cursor.browserView.executeJavaScript": () => ({ ok: true })
    });
    const browser = new CursorBrowser(commands);
    const result = await browser.runInTab("ok", { targetUrl: GRAPHQL });
    assert.deepEqual(result, { ok: true });
  });

  it("runInTab uses focusGraphqlTab fallback before throwing", async () => {
    const ctx = {
      tabs: [{ viewId: "dash", url: APP }],
      activeViewId: "dash"
    };
    const { commands } = createMockCommands({
      "cursor.browserView.listTabs": () => ctx,
      "cursor.browserView.getURL": () => APP,
      "cursor.browserView.selectTab": () => ({ success: true }),
      "cursor.browserView.navigate": () => undefined,
      "cursor.browserView.executeJavaScript": () => ({ ok: true })
    });
    const browser = new CursorBrowser(commands);
    const result = await browser.runInTab("ok", { targetUrl: GRAPHQL });
    assert.deepEqual(result, { ok: true });
  });

  it("ensureBrowserTab reuses graphql tab when urls match by host and path", async () => {
    const ctx = {
      tabs: [{ viewId: "gql", url: "https://dev.com/graphql?old=1" }],
      activeViewId: "gql"
    };
    const { commands, calls } = createMockCommands({
      "cursor.browserView.listTabs": () => ctx,
      "cursor.browserView.getURL": () => "https://dev.com/graphql?old=1",
      "cursor.browserView.selectTab": () => ({ success: true })
    });
    const browser = new CursorBrowser(commands);
    await browser.ensureBrowserTab(GRAPHQL);
    assert.ok(!calls.some((c) => c.cmd === "cursor.browserView.navigate"));
  });

  it("ensureBrowserTab selects graphql tab when host navigation unavailable", async () => {
    const ctx = {
      tabs: [{ viewId: "gql", url: GRAPHQL }],
      activeViewId: "gql"
    };
    const { commands } = createMockCommands({
      "cursor.browserView.listTabs": () => ctx,
      "cursor.browserView.getURL": () => "https://other.com/graphql",
      "cursor.browserView.selectTab": () => ({ success: true })
    });
    const browser = new CursorBrowser(commands);
    await browser.ensureBrowserTab(GRAPHQL);
  });

  it("listTabs and findTabByUrl delegate to enriched context", async () => {
    const ctx = {
      tabs: [{ viewId: "gql", url: GRAPHQL }],
      activeViewId: "gql"
    };
    const { commands } = createMockCommands({
      "cursor.browserView.listTabs": () => ctx,
      "cursor.browserView.getURL": () => GRAPHQL
    });
    const browser = new CursorBrowser(commands);
    assert.equal((await browser.listTabs()).length, 1);
    assert.equal((await browser.findTabByUrl(GRAPHQL))?.viewId, "gql");
  });

  it("selectTab returns true for ACTIVE_VIEW_ID without calling API", async () => {
    const { commands, calls } = createMockCommands({});
    const browser = new CursorBrowser(commands);
    assert.equal(await browser.selectTab(ACTIVE_VIEW_ID), true);
    assert.equal(calls.length, 0);
  });

  it("runInTab rethrows non-browser script errors on allowNonGraphqlTab", async () => {
    const { commands } = createMockCommands({
      "cursor.browserView.listTabs": () => ({ tabs: [] }),
      "cursor.browserView.getURL": () => APP,
      "cursor.browserView.executeJavaScript": () => {
        throw new Error("syntax error in page script");
      }
    });
    const browser = new CursorBrowser(commands);
    await assert.rejects(
      () => browser.runInTab("bad", { allowNonGraphqlTab: true, targetUrl: GRAPHQL }),
      /syntax error in page script/
    );
  });

  it("ensureBrowserTab throws when no usable tab and createIfMissing is false", async () => {
    const { commands } = createMockCommands({
      "cursor.browserView.listTabs": () => ({ tabs: [] }),
      "cursor.browserView.getURL": () => undefined,
      "cursor.browserView.navigate": () => {
        throw new Error("navigate failed");
      }
    });
    const browser = new CursorBrowser(commands);
    await assert.rejects(() => browser.ensureBrowserTab(GRAPHQL), /No usable browser tab/);
  });

  it("ensureBrowserTab opens a new tab when createIfMissing is true", async () => {
    const { commands, calls } = createMockCommands({
      "cursor.browserView.listTabs": () => ({ tabs: [] }),
      "cursor.browserView.getURL": () => undefined,
      "cursor.browserView.newTab": () => "created-tab",
      "cursor.browserView.navigate": () => {
        throw new Error("navigate failed");
      }
    });
    const browser = new CursorBrowser(commands);
    await browser.ensureBrowserTab(GRAPHQL, { createIfMissing: true });
    assert.ok(calls.some((c) => c.cmd === "cursor.browserView.newTab"));
  });

  it("getEnrichedTabContext enriches tabs missing URLs via selectTab probe", async () => {
    const { commands } = createMockCommands({
      "cursor.browserView.listTabs": () => ({
        tabs: [{ viewId: "probe-tab", title: "App" }],
        activeViewId: "probe-tab"
      }),
      "cursor.browserView.getURL": () => APP,
      "cursor.browserView.selectTab": () => ({ success: true })
    });
    const browser = new CursorBrowser(commands);
    const ctx = await browser.getEnrichedTabContext();
    assert.equal(ctx.tabs[0]?.url, APP);
  });

  it("tryRunScriptOnGraphqlTabs skips tabs when selectTab fails", async () => {
    const ctx = {
      tabs: [
        { viewId: "gql-a", url: GRAPHQL },
        { viewId: "gql-b", url: GRAPHQL }
      ],
      activeViewId: "gql-a"
    };
    let execCount = 0;
    const { commands } = createMockCommands({
      "cursor.browserView.listTabs": () => ctx,
      "cursor.browserView.getURL": () => APP,
      "cursor.browserView.selectTab": (viewId) =>
        viewId === "gql-a" ? { success: false } : { success: true },
      "cursor.browserView.executeJavaScript": () => {
        execCount += 1;
        return { ok: true };
      }
    });
    const browser = new CursorBrowser(commands);
    const result = await browser.runInTab("ok", {
      targetUrl: GRAPHQL,
      allowNonGraphqlTab: true
    });
    assert.deepEqual(result, { ok: true });
    assert.equal(execCount, 1);
  });

  it("runInTab returns from allowNonGraphqlTab candidate tabs", async () => {
    const ctx = {
      tabs: [{ viewId: "app", url: APP }],
      activeViewId: "app"
    };
    const { commands } = createMockCommands({
      "cursor.browserView.listTabs": () => ctx,
      "cursor.browserView.getURL": () => APP,
      "cursor.browserView.selectTab": () => ({ success: true }),
      "cursor.browserView.executeJavaScript": () => ({ fromApp: true })
    });
    const browser = new CursorBrowser(commands);
    const result = await browser.runInTab("ok", {
      targetUrl: GRAPHQL,
      allowNonGraphqlTab: true,
      hintViewId: "app",
      authCaptureUrl: APP
    });
    assert.deepEqual(result, { fromApp: true });
  });

  it("runInTab returns from generic candidate tabs after graphql attempts fail", async () => {
    const ctx = {
      tabs: [{ viewId: "dash", url: "https://dev.com/dashboard" }],
      activeViewId: "dash"
    };
    const { commands } = createMockCommands({
      "cursor.browserView.listTabs": () => ctx,
      "cursor.browserView.getURL": () => "https://dev.com/dashboard",
      "cursor.browserView.selectTab": () => ({ success: true }),
      "cursor.browserView.executeJavaScript": () => ({ fromCandidate: true })
    });
    const browser = new CursorBrowser(commands);
    const result = await browser.runInTab("ok", {
      targetUrl: GRAPHQL,
      allowNonGraphqlTab: true
    });
    assert.deepEqual(result, { fromCandidate: true });
  });

  it("tryNavigateToTarget returns true when active tab already matches target", async () => {
    const { commands } = createMockCommands({
      "cursor.browserView.listTabs": () => ({ tabs: [] }),
      "cursor.browserView.getURL": () => GRAPHQL,
      "cursor.browserView.executeJavaScript": () => ({ ok: true })
    });
    const browser = new CursorBrowser(commands);
    const result = await browser.runInTab("ok", {
      targetUrl: GRAPHQL,
      navigateToTargetUrl: true
    });
    assert.deepEqual(result, { ok: true });
  });

  it("ensureBrowserTab selects an existing graphql tab when focus lands on it", async () => {
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

  it("ensureBrowserTab navigates the active tab when no graphql tab exists", async () => {
    const { commands, calls } = createMockCommands({
      "cursor.browserView.listTabs": () => ({ tabs: [] }),
      "cursor.browserView.getURL": () => APP,
      "cursor.browserView.navigate": () => undefined
    });
    const browser = new CursorBrowser(commands);
    await browser.ensureBrowserTab(GRAPHQL, { createIfMissing: true });
    assert.ok(calls.some((c) => c.cmd === "cursor.browserView.navigate"));
  });

  it("ensureBrowserTab throws when newTab fails under createIfMissing", async () => {
    const { commands } = createMockCommands({
      "cursor.browserView.listTabs": () => ({ tabs: [] }),
      "cursor.browserView.getURL": () => undefined,
      "cursor.browserView.navigate": () => {
        throw new Error("navigate failed");
      },
      "cursor.browserView.newTab": () => undefined
    });
    const browser = new CursorBrowser(commands);
    await assert.rejects(
      () => browser.ensureBrowserTab(GRAPHQL, { createIfMissing: true }),
      /Could not open Cursor browser tab/
    );
  });
});

describe("buildReadCachedGraphqlRequestScript runtime", () => {
  it("executes in vm with sessionStorage payload", () => {
    const storage = new Map([
      [
        "__apolloAuth",
        JSON.stringify({
          headers: { Authorization: "Bearer x" },
          operation: "query Employees { id }",
          variablesJson: '{"take":10}'
        })
      ]
    ]);
    const context = {
      sessionStorage: {
        getItem(key) {
          return storage.get(key) ?? null;
        }
      }
    };
    const script = buildReadCachedGraphqlRequestScript();
    const result = vm.runInNewContext(script, context);
    assert.equal(result.operation, "query Employees { id }");
    assert.match(result.variablesJson, /"take": 10/);
  });
});
