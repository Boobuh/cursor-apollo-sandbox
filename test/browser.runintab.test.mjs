import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CursorBrowser } from "../dist/browser.js";
import { createMockCommands } from "./helpers/mock-browser.mjs";

const GRAPHQL = "https://dev.com/graphql";
const APP = "https://dev.com/app";

describe("runInTab path coverage", () => {
  it("continues past graphql tabs when selectTab fails", async () => {
    const ctx = {
      tabs: [
        { viewId: "gql-1", url: GRAPHQL },
        { viewId: "gql-2", url: GRAPHQL }
      ],
      activeViewId: "gql-1"
    };
    const { commands } = createMockCommands({
      "cursor.browserView.listTabs": () => ctx,
      "cursor.browserView.getURL": () => APP,
      "cursor.browserView.selectTab": (viewId) => ({
        success: viewId !== "gql-1"
      }),
      "cursor.browserView.executeJavaScript": () => ({ ok: true })
    });
    const browser = new CursorBrowser(commands);
    const result = await browser.runInTab("script", { targetUrl: GRAPHQL });
    assert.deepEqual(result, { ok: true });
  });

  it("returns from allowNonGraphqlTab app candidates after active view fails", async () => {
    const ctx = {
      tabs: [{ viewId: "app", url: APP }],
      activeViewId: "app"
    };
    const { commands } = createMockCommands({
      "cursor.browserView.listTabs": () => ctx,
      "cursor.browserView.getURL": () => APP,
      "cursor.browserView.selectTab": () => ({ success: true }),
      "cursor.browserView.executeJavaScript": () => {
        throw new Error("Browser view not found");
      }
    });
    const browser = new CursorBrowser(commands);
    await assert.rejects(
      () =>
        browser.runInTab("script", {
          targetUrl: GRAPHQL,
          allowNonGraphqlTab: true,
          hintViewId: "app"
        }),
      /Cursor browser unavailable/
    );
  });

  it("returns from candidate tabs when graphql tabs do not match", async () => {
    const ctx = {
      tabs: [{ viewId: "dash", url: "https://dev.com/dashboard" }],
      activeViewId: "dash"
    };
    const { commands } = createMockCommands({
      "cursor.browserView.listTabs": () => ctx,
      "cursor.browserView.getURL": () => "https://dev.com/dashboard",
      "cursor.browserView.selectTab": () => ({ success: true }),
      "cursor.browserView.executeJavaScript": () => ({ candidate: true })
    });
    const browser = new CursorBrowser(commands);
    const result = await browser.runInTab("script", {
      targetUrl: GRAPHQL,
      allowNonGraphqlTab: true
    });
    assert.deepEqual(result, { candidate: true });
  });

  it("uses navigateToTargetUrl when active tab already matches graphql path", async () => {
    const { commands } = createMockCommands({
      "cursor.browserView.listTabs": () => ({ tabs: [] }),
      "cursor.browserView.getURL": () => GRAPHQL,
      "cursor.browserView.executeJavaScript": () => ({ navigated: true })
    });
    const browser = new CursorBrowser(commands);
    const result = await browser.runInTab("script", {
      targetUrl: GRAPHQL,
      navigateToTargetUrl: true
    });
    assert.deepEqual(result, { navigated: true });
  });

  it("skips navigateToTargetUrl navigation when allowNonGraphqlTab is set", async () => {
    const ctx = {
      tabs: [{ viewId: "app", url: APP }],
      activeViewId: "app"
    };
    const { commands, calls } = createMockCommands({
      "cursor.browserView.listTabs": () => ctx,
      "cursor.browserView.getURL": () => APP,
      "cursor.browserView.selectTab": () => ({ success: true }),
      "cursor.browserView.executeJavaScript": () => ({ fromApp: true })
    });
    const browser = new CursorBrowser(commands);
    const result = await browser.runInTab("script", {
      targetUrl: GRAPHQL,
      allowNonGraphqlTab: true,
      navigateToTargetUrl: true,
      hintViewId: "app"
    });
    assert.deepEqual(result, { fromApp: true });
    assert.ok(!calls.some((c) => c.cmd === "cursor.browserView.navigate"));
  });

  it("ensureBrowserTab picks graphql tab when focus and host navigation fail", async () => {
    const ctx = {
      tabs: [
        { viewId: "app", url: APP },
        { viewId: "gql", url: GRAPHQL }
      ],
      activeViewId: "app"
    };
    const { commands } = createMockCommands({
      "cursor.browserView.listTabs": () => ctx,
      "cursor.browserView.getURL": () => APP,
      "cursor.browserView.selectTab": (viewId) => ({
        success: viewId === "gql"
      }),
      "cursor.browserView.navigate": () => {
        throw new Error("navigate failed");
      }
    });
    const browser = new CursorBrowser(commands);
    await browser.ensureBrowserTab(GRAPHQL);
  });

  it("ensureBrowserTab navigates active tab when only active url is available", async () => {
    const { commands, calls } = createMockCommands({
      "cursor.browserView.listTabs": () => ({ tabs: [] }),
      "cursor.browserView.getURL": () => APP,
      "cursor.browserView.navigate": () => undefined
    });
    const browser = new CursorBrowser(commands);
    await browser.ensureBrowserTab(GRAPHQL, { createIfMissing: true });
    assert.ok(calls.some((c) => c.cmd === "cursor.browserView.navigate"));
  });

  it("ensureBrowserTab tolerates invalid endpoint urls in host lookup", async () => {
    const { commands } = createMockCommands({
      "cursor.browserView.listTabs": () => ({ tabs: [] }),
      "cursor.browserView.getURL": () => undefined,
      "cursor.browserView.newTab": () => "created",
      "cursor.browserView.navigate": () => {
        throw new Error("navigate failed");
      }
    });
    const browser = new CursorBrowser(commands);
    await browser.ensureBrowserTab("not-a-valid-url", { createIfMissing: true });
  });

  it("tryNavigateToTarget succeeds when active url matches target path", async () => {
    const { commands } = createMockCommands({
      "cursor.browserView.listTabs": () => ({ tabs: [] }),
      "cursor.browserView.getURL": () => "https://dev.com/graphql?trace=1",
      "cursor.browserView.executeJavaScript": () => {
        throw new Error("Browser view not found");
      },
      "cursor.browserView.navigate": () => undefined
    });
    const browser = new CursorBrowser(commands);
    await assert.rejects(
      () =>
        browser.runInTab("script", {
          targetUrl: GRAPHQL,
          navigateToTargetUrl: true
        }),
      /Cursor browser unavailable/
    );
  });

  it("tryNavigateToTarget skips navigation for allowNonGraphqlTab requests", async () => {
    const ctx = {
      tabs: [{ viewId: "app", url: APP }],
      activeViewId: "app"
    };
    const { commands, calls } = createMockCommands({
      "cursor.browserView.listTabs": () => ctx,
      "cursor.browserView.getURL": () => APP,
      "cursor.browserView.selectTab": () => ({ success: true }),
      "cursor.browserView.executeJavaScript": () => {
        throw new Error("Browser view not found");
      }
    });
    const browser = new CursorBrowser(commands);
    await assert.rejects(
      () =>
        browser.runInTab("script", {
          targetUrl: GRAPHQL,
          allowNonGraphqlTab: true,
          navigateToTargetUrl: true,
          hintViewId: "app"
        }),
      /Cursor browser unavailable/
    );
    assert.ok(!calls.some((c) => c.cmd === "cursor.browserView.navigate"));
  });

  it("tryNavigateToTarget returns false when navigation fails", async () => {
    const { commands } = createMockCommands({
      "cursor.browserView.listTabs": () => ({ tabs: [] }),
      "cursor.browserView.getURL": () => APP,
      "cursor.browserView.navigate": () => {
        throw new Error("navigate failed");
      },
      "cursor.browserView.executeJavaScript": () => ({ late: true })
    });
    const browser = new CursorBrowser(commands);
    await assert.rejects(
      () =>
        browser.runInTab("script", {
          targetUrl: GRAPHQL,
          navigateToTargetUrl: true
        }),
      /Cursor browser unavailable/
    );
  });

  it("runInTab returns from generic candidates after graphql and app attempts fail", async () => {
    const ctx = {
      tabs: [
        { viewId: "gql", url: GRAPHQL },
        { viewId: "dash", url: "https://dev.com/dashboard" }
      ],
      activeViewId: "dash"
    };
    let gqlExecutions = 0;
    const { commands } = createMockCommands({
      "cursor.browserView.listTabs": () => ctx,
      "cursor.browserView.getURL": () => "https://dev.com/dashboard",
      "cursor.browserView.selectTab": () => ({ success: true }),
      "cursor.browserView.executeJavaScript": () => {
        gqlExecutions += 1;
        if (gqlExecutions === 1) {
          throw new Error("Browser view not found");
        }
        return { fromCandidates: true };
      }
    });
    const browser = new CursorBrowser(commands);
    const result = await browser.runInTab("script", {
      targetUrl: GRAPHQL,
      allowNonGraphqlTab: true
    });
    assert.deepEqual(result, { fromCandidates: true });
  });

  it("ensureBrowserTab selects graphql tab when host loop cannot select tabs", async () => {
    let selectCalls = 0;
    const ctx = {
      tabs: [{ viewId: "gql", url: GRAPHQL }],
      activeViewId: "other"
    };
    const { commands } = createMockCommands({
      "cursor.browserView.listTabs": () => ctx,
      "cursor.browserView.getURL": () => APP,
      "cursor.browserView.selectTab": () => {
        selectCalls += 1;
        return { success: selectCalls >= 4 };
      },
      "cursor.browserView.navigate": () => {
        throw new Error("navigate failed");
      }
    });
    const browser = new CursorBrowser(commands);
    await browser.ensureBrowserTab(GRAPHQL);
  });

  it("runInTab returns from candidate view ids after graphql execution fails", async () => {
    const ctx = {
      tabs: [{ viewId: "gql", url: GRAPHQL }],
      activeViewId: "gql"
    };
    let executions = 0;
    let urlReads = 0;
    const { commands } = createMockCommands({
      "cursor.browserView.listTabs": () => ctx,
      "cursor.browserView.getURL": () => {
        urlReads += 1;
        return urlReads >= 4 ? GRAPHQL : APP;
      },
      "cursor.browserView.selectTab": () => ({ success: true }),
      "cursor.browserView.executeJavaScript": () => {
        executions += 1;
        if (executions <= 2) {
          throw new Error("Browser view not found");
        }
        return { candidate: true };
      }
    });
    const browser = new CursorBrowser(commands);
    const result = await browser.runInTab("script", { targetUrl: GRAPHQL });
    assert.deepEqual(result, { candidate: true });
  });

  it("ensureBrowserTab navigates the active tab when tab selection fails everywhere", async () => {
    let navigateCalls = 0;
    const { commands, calls } = createMockCommands({
      "cursor.browserView.listTabs": () => ({ tabs: [] }),
      "cursor.browserView.getURL": () => APP,
      "cursor.browserView.selectTab": () => ({ success: false }),
      "cursor.browserView.navigate": () => {
        navigateCalls += 1;
        if (navigateCalls === 1) {
          throw new Error("focus navigate failed");
        }
        return undefined;
      }
    });
    const browser = new CursorBrowser(commands);
    await browser.ensureBrowserTab(GRAPHQL);
    assert.ok(calls.filter((c) => c.cmd === "cursor.browserView.navigate").length >= 2);
  });
});
