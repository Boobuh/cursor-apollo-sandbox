import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  findAuthCaptureTabsInContext,
  findTabByUrlInContext,
  collectCandidateViewIds
} from "../dist/browser.utils.js";

const GRAPHQL = "https://dev.com/graphql";

describe("browser.utils auth capture coverage", () => {
  it("findAuthCaptureTabsInContext ignores invalid configured URLs", () => {
    const tabs = findAuthCaptureTabsInContext(
      {
        tabs: [{ viewId: "app", url: "https://dev.com/app" }],
        activeViewId: "app"
      },
      "not-a-url",
      "also-invalid"
    );
    assert.deepEqual(tabs, []);
  });

  it("findAuthCaptureTabsInContext keeps tabs without url on matching host", () => {
    const tabs = findAuthCaptureTabsInContext(
      {
        tabs: [
          { viewId: "app", url: "https://dev.com/app" },
          { viewId: "gql", url: GRAPHQL }
        ],
        activeViewId: "app",
        lastInteractedViewId: "app"
      },
      GRAPHQL
    );
    assert.equal(tabs[0]?.viewId, "app");
  });

  it("findAuthCaptureTabsInContext rejects tabs on foreign hosts", () => {
    const tabs = findAuthCaptureTabsInContext(
      {
        tabs: [{ viewId: "other", url: "https://other.com/app" }],
        activeViewId: "other"
      },
      GRAPHQL
    );
    assert.deepEqual(tabs, []);
  });

  it("findAuthCaptureTabsInContext ignores tabs with invalid urls", () => {
    const tabs = findAuthCaptureTabsInContext(
      {
        tabs: [{ viewId: "bad-url", url: "not-a-valid-url" }],
        activeViewId: "bad-url"
      },
      GRAPHQL
    );
    assert.deepEqual(tabs, []);
  });

  it("findTabByUrlInContext returns undefined for invalid target url", () => {
    assert.equal(findTabByUrlInContext({ tabs: [] }, "bad-url"), undefined);
  });

  it("findTabByUrlInContext ignores tabs with invalid urls", () => {
    assert.equal(
      findTabByUrlInContext(
        { tabs: [{ viewId: "x", url: "not-a-url" }] },
        GRAPHQL
      ),
      undefined
    );
  });

  it("collectCandidateViewIds includes auth-capture tabs when allowed", () => {
    const ids = collectCandidateViewIds(
      {
        tabs: [{ viewId: "app", url: "https://dev.com/app" }],
        activeViewId: "app"
      },
      {
        targetUrl: GRAPHQL,
        allowNonGraphqlTab: true,
        authCaptureUrl: "https://dev.com/login"
      }
    );
    assert.ok(ids.includes("app"));
  });

  it("collectCandidateViewIds tolerates invalid target urls", () => {
    const ids = collectCandidateViewIds(
      {
        tabs: [{ viewId: "app", url: "https://dev.com/app" }],
        activeViewId: "app"
      },
      { targetUrl: "not-a-url", allowNonGraphqlTab: true }
    );
    assert.ok(ids.includes("app"));
  });

  it("findAuthCaptureTabsInContext scores active and last-interacted tabs", () => {
    const tabs = findAuthCaptureTabsInContext(
      {
        tabs: [
          { viewId: "active", url: "https://dev.com/app-active" },
          { viewId: "last", url: "https://dev.com/app-last" }
        ],
        activeViewId: "active",
        lastInteractedViewId: "last"
      },
      GRAPHQL
    );
    assert.equal(tabs[0]?.viewId, "last");
    assert.equal(tabs[1]?.viewId, "active");
  });

  it("findTabByUrlInContext matches host and graphql path", () => {
    const tab = findTabByUrlInContext(
      {
        tabs: [{ viewId: "gql", url: "https://dev.com/graphql?x=1" }]
      },
      GRAPHQL
    );
    assert.equal(tab?.viewId, "gql");
  });
});
