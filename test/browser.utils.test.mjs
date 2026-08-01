import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  augmentContextWithActiveView,
  browserTabMatchesUrl,
  findAuthCaptureTabsInContext,
  findGraphqlTabsInContext,
  findTabByHostInContext,
  findTabByUrlInContext,
  isBrowserViewError,
  normalizeBrowserTabs,
  normalizePath,
  parseListTabsResult
} from "../dist/browser.utils.js";
import { ACTIVE_VIEW_ID } from "../dist/browser.types.js";

describe("isBrowserViewError", () => {
  it("detects Cursor browser view failures", () => {
    assert.equal(isBrowserViewError(new Error("Browser view not found")), true);
    assert.equal(
      isBrowserViewError(new Error("No browser view available")),
      true
    );
    assert.equal(isBrowserViewError(new Error("Browser tab not found")), true);
    assert.equal(isBrowserViewError(new Error("Network error")), false);
  });
});

describe("browserTabMatchesUrl", () => {
  it("matches same host and graphql path", () => {
    assert.equal(
      browserTabMatchesUrl(
        "https://app.example.com/graphql",
        "https://app.example.com/graphql/"
      ),
      true
    );
    assert.equal(
      browserTabMatchesUrl(
        "https://localhost:3001/graphql",
        "https://app.example.com/graphql"
      ),
      false
    );
  });
});

describe("findTabByUrlInContext", () => {
  it("prefers last interacted matching tab", () => {
    const tab = findTabByUrlInContext(
      {
        tabs: [
          { viewId: "a", url: "https://ex.com/graphql" },
          { viewId: "b", url: "https://dev.com/graphql" }
        ],
        lastInteractedViewId: "b",
        activeViewId: "a"
      },
      "https://dev.com/graphql"
    );
    assert.equal(tab?.viewId, "b");
  });
});

describe("normalizePath", () => {
  it("strips trailing slashes and preserves root", () => {
    assert.equal(normalizePath("/graphql/"), "/graphql");
    assert.equal(normalizePath("/"), "/");
    assert.equal(normalizePath(""), "/");
  });
});

describe("findTabByHostInContext", () => {
  it("falls back to host match", () => {
    const tab = findTabByHostInContext(
      {
        tabs: [{ viewId: "z", url: "https://dev.com/dashboard" }],
        activeViewId: "z"
      },
      "dev.com"
    );
    assert.equal(tab?.viewId, "z");
  });
});

describe("findAuthCaptureTabsInContext", () => {
  it("returns same-host app tabs without /graphql", () => {
    const tabs = findAuthCaptureTabsInContext(
      {
        tabs: [
          { viewId: "a", url: "https://app.example.com/app" },
          { viewId: "b", url: "https://app.example.com/graphql" },
          { viewId: "c", url: "https://other.com/app" }
        ],
        lastInteractedViewId: "a"
      },
      "https://app.example.com/graphql"
    );

    assert.deepEqual(tabs.map((tab) => tab.viewId), ["a"]);
  });
});

describe("normalizeBrowserTabs", () => {
  it("maps alternate id fields and preserves order", () => {
    const tabs = normalizeBrowserTabs([
      { id: "tab-1", href: "https://dev.com/app" },
      { title: "Apollo Server" }
    ]);

    assert.equal(tabs[0]?.viewId, "tab-1");
    assert.equal(tabs[0]?.url, "https://dev.com/app");
    assert.equal(tabs[1]?.viewId, "__index_1");
  });
});

describe("parseListTabsResult", () => {
  it("accepts raw tab arrays and alternate field names", () => {
    const fromArray = parseListTabsResult([
      { viewId: "a", url: "https://dev.com/app" }
    ]);
    assert.equal(fromArray.tabs.length, 1);

    const fromViews = parseListTabsResult({
      views: [{ id: "b", href: "https://dev.com/graphql" }],
      activeId: "b"
    });
    assert.equal(fromViews.tabs[0]?.viewId, "b");
    assert.equal(fromViews.activeViewId, "b");
  });
});

describe("augmentContextWithActiveView", () => {
  it("synthesizes active tab when listTabs is empty", () => {
    const ctx = augmentContextWithActiveView(
      { tabs: [] },
      "https://dev.com/en/app"
    );
    assert.equal(ctx.tabs.length, 1);
    assert.equal(ctx.tabs[0]?.viewId, ACTIVE_VIEW_ID);
    assert.equal(ctx.activeViewId, ACTIVE_VIEW_ID);
  });
});

describe("findGraphqlTabsInContext", () => {
  it("returns every open tab whose URL contains /graphql", () => {
    const tabs = findGraphqlTabsInContext({
      tabs: [
        { viewId: "a", url: "https://dev.com/dashboard" },
        { viewId: "b", url: "https://staging.com/graphql" },
        { viewId: "c", title: "Apollo Server", url: "https://dev.com/app" },
        { viewId: "d", url: "https://app.example.com/graphql?x=1" }
      ],
      activeViewId: "a",
      lastInteractedViewId: "d"
    });

    assert.deepEqual(
      tabs.map((tab) => tab.viewId),
      ["d", "b"]
    );
  });

  it("prefers tabs matching targetUrl host among graphql tabs", () => {
    const tabs = findGraphqlTabsInContext(
      {
        tabs: [
          { viewId: "a", url: "https://staging.com/graphql" },
          { viewId: "b", url: "https://app.example.com/graphql" }
        ],
        activeViewId: "a",
        lastInteractedViewId: "a"
      },
      "https://app.example.com/graphql"
    );

    assert.deepEqual(
      tabs.map((tab) => tab.viewId),
      ["b", "a"]
    );
  });
});
