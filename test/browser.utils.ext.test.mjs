import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  augmentContextWithActiveView,
  collectCandidateViewIds,
  findAllTabsByHostInContext,
  findGraphqlTabsInContext,
  isBrowserViewError,
  isSelectableViewId,
  normalizeBrowserTab,
  parseListTabsResult,
  tabUrlHasGraphqlPath,
  browserTabMatchesUrl
} from "../dist/browser.utils.js";
import { ACTIVE_VIEW_ID } from "../dist/browser.types.js";

const GRAPHQL = "https://dev.com/graphql";

describe("browser.utils edge cases", () => {
  it("browserTabMatchesUrl returns false for invalid URLs", () => {
    assert.equal(browserTabMatchesUrl("not-a-url", GRAPHQL), false);
  });

  it("tabUrlHasGraphqlPath handles missing url", () => {
    assert.equal(tabUrlHasGraphqlPath(undefined), false);
    assert.equal(tabUrlHasGraphqlPath("https://dev.com/graphql"), true);
  });

  it("isSelectableViewId rejects synthetic index tabs", () => {
    assert.equal(isSelectableViewId("__index_0"), false);
    assert.equal(isSelectableViewId("real-tab"), true);
  });

  it("normalizeBrowserTab returns undefined for empty records", () => {
    assert.equal(normalizeBrowserTab({}, 0), undefined);
    assert.equal(normalizeBrowserTab(null, 0), undefined);
  });

  it("normalizeBrowserTab reads alternate id and href fields", () => {
    const tab = normalizeBrowserTab({ id: "x", href: "https://a.com" }, 0);
    assert.equal(tab?.viewId, "x");
    assert.equal(tab?.url, "https://a.com");
  });

  it("parseListTabsResult handles empty object", () => {
    assert.deepEqual(parseListTabsResult(null).tabs, []);
    assert.deepEqual(parseListTabsResult({}).tabs, []);
  });

  it("findAllTabsByHostInContext returns host matches in interaction order", () => {
    const tabs = findAllTabsByHostInContext(
      {
        tabs: [
          { viewId: "a", url: "https://dev.com/a" },
          { viewId: "b", url: "https://other.com/x" },
          { viewId: "c", url: "https://dev.com/b" }
        ],
        lastInteractedViewId: "c",
        activeViewId: "a"
      },
      "dev.com"
    );
    assert.deepEqual(tabs.map((t) => t.viewId), ["c", "a"]);
  });

  it("collectCandidateViewIds dedupes hint and auth capture tabs", () => {
    const ids = collectCandidateViewIds(
      {
        tabs: [
          { viewId: "app", url: "https://dev.com/app" },
          { viewId: "gql", url: "https://dev.com/graphql" }
        ],
        activeViewId: "app",
        lastInteractedViewId: "app"
      },
      {
        hintViewId: "app",
        targetUrl: "https://dev.com/graphql",
        authCaptureUrl: "https://dev.com/login"
      }
    );
    assert.ok(ids.includes("app"));
    assert.ok(ids.includes("gql"));
  });

  it("augmentContextWithActiveView synthesizes tab when list is empty", () => {
    const ctx = augmentContextWithActiveView({ tabs: [] }, GRAPHQL);
    assert.equal(ctx.tabs[0]?.viewId, ACTIVE_VIEW_ID);
    assert.equal(ctx.activeViewId, ACTIVE_VIEW_ID);
  });

  it("augmentContextWithActiveView merges active url into existing tabs", () => {
    const ctx = augmentContextWithActiveView(
      { tabs: [{ viewId: "t1", url: "https://dev.com/app" }] },
      GRAPHQL
    );
    assert.ok(ctx.tabs.some((tab) => tab.viewId === ACTIVE_VIEW_ID));
  });

  it("findGraphqlTabsInContext scores preferred host and active tab", () => {
    const ordered = findGraphqlTabsInContext(
      {
        tabs: [
          { viewId: "other", url: "https://other.com/graphql" },
          { viewId: "dev", url: GRAPHQL }
        ],
        activeViewId: "other",
        lastInteractedViewId: "dev"
      },
      GRAPHQL
    );
    assert.equal(ordered[0]?.viewId, "dev");
  });

  it("collectCandidateViewIds includes apollo-titled tabs without urls", () => {
    const ids = collectCandidateViewIds(
      {
        tabs: [{ viewId: "apollo-tab", title: "Apollo Server Sandbox" }],
        activeViewId: "apollo-tab"
      },
      { targetUrl: GRAPHQL }
    );
    assert.ok(ids.includes("apollo-tab"));
  });

  it("isBrowserViewError matches known browser failure markers", () => {
    assert.equal(isBrowserViewError(new Error("Browser view not found")), true);
    assert.equal(isBrowserViewError(new Error("other")), false);
  });

  it("parseListTabsResult accepts array payloads and alternate field names", () => {
    const ctx = parseListTabsResult([
      { id: "x", href: "https://dev.com/graphql" }
    ]);
    assert.equal(ctx.tabs[0]?.viewId, "x");
    const alt = parseListTabsResult({
      views: [{ viewId: "v1", url: GRAPHQL }],
      activeId: "v1"
    });
    assert.equal(alt.activeViewId, "v1");
  });
});
