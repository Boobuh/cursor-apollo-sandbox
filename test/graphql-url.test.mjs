import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isGraphqlEndpointUrl,
  normalizeGraphqlEndpointUrl,
  resolveSandboxConfig
} from "../dist/apollo/graphql-url.js";

const baseConfig = {
  authCaptureUrl: "",
  graphqlUrl: "http://localhost:3001/graphql",
  graphqlUrlFromBrowserTab: false,
  graphqlUrlMatch: "",
  sandboxWaitMs: 9000,
  headerDetectMs: 6000,
  defaultOperation: "query { __typename }",
  defaultVariablesJson: "{}"
};

function mockBrowser(ctx) {
  return {
    getTabContext: async () => ctx,
    getEnrichedTabContext: async () => ctx
  };
}

describe("isGraphqlEndpointUrl", () => {
  it("accepts /graphql paths", () => {
    assert.equal(
      isGraphqlEndpointUrl("https://app.example.com/graphql"),
      true
    );
    assert.equal(
      isGraphqlEndpointUrl("https://dev.com/app/graphql/"),
      true
    );
    assert.equal(
      isGraphqlEndpointUrl("https://dev.com/api/v1/graphql/extra"),
      true
    );
  });

  it("rejects non-graphql pages", () => {
    assert.equal(isGraphqlEndpointUrl("https://dev.com/dashboard"), false);
    assert.equal(isGraphqlEndpointUrl("not-a-url"), false);
  });
});

describe("normalizeGraphqlEndpointUrl", () => {
  it("strips query/hash and trailing slashes", () => {
    assert.equal(
      normalizeGraphqlEndpointUrl(
        "https://dev.com/graphql/?foo=1#section"
      ),
      "https://dev.com/graphql"
    );
  });

  it("appends /graphql when path lacks graphql segment", () => {
    assert.equal(
      normalizeGraphqlEndpointUrl("https://dev.com/api"),
      "https://dev.com/api/graphql"
    );
  });
});

describe("resolveSandboxConfig", () => {
  it("uses settings when browser tab mode is off", async () => {
    const resolved = await resolveSandboxConfig(
      mockBrowser({ tabs: [] }),
      baseConfig
    );
    assert.equal(resolved.graphqlUrlSource, "settings");
    assert.equal(resolved.graphqlUrl, baseConfig.graphqlUrl);
    assert.equal(resolved.graphqlUrlMatch, "/graphql");
  });

  it("prefers last-interacted graphql tab when enabled", async () => {
    const resolved = await resolveSandboxConfig(
      mockBrowser({
        tabs: [
          { viewId: "a", url: "https://staging.com/graphql" },
          {
            viewId: "b",
            url: "https://app.example.com/graphql?x=1"
          }
        ],
        activeViewId: "a",
        lastInteractedViewId: "b"
      }),
      { ...baseConfig, graphqlUrlFromBrowserTab: true }
    );
    assert.equal(resolved.graphqlUrlSource, "browserTab");
    assert.equal(
      resolved.graphqlUrl,
      "https://app.example.com/graphql"
    );
    assert.equal(resolved.graphqlUrlMatch, "/graphql");
  });

  it("falls back to settings when no graphql tab is open", async () => {
    const resolved = await resolveSandboxConfig(
      mockBrowser({
        tabs: [{ viewId: "a", url: "https://dev.com/dashboard" }],
        activeViewId: "a"
      }),
      { ...baseConfig, graphqlUrlFromBrowserTab: true }
    );
    assert.equal(resolved.graphqlUrlSource, "settings");
    assert.equal(resolved.graphqlUrl, baseConfig.graphqlUrl);
  });

  it("ignores Apollo Server title when URL lacks /graphql", async () => {
    const resolved = await resolveSandboxConfig(
      mockBrowser({
        tabs: [{ viewId: "a", title: "Apollo Server", url: "https://dev.com/" }],
        activeViewId: "a",
        lastInteractedViewId: "a"
      }),
      { ...baseConfig, graphqlUrlFromBrowserTab: true }
    );
    assert.equal(resolved.graphqlUrlSource, "settings");
  });

  it("keeps explicit graphqlUrlMatch override", async () => {
    const resolved = await resolveSandboxConfig(
      mockBrowser({ tabs: [] }),
      { ...baseConfig, graphqlUrlMatch: "/custom-gql" }
    );
    assert.equal(resolved.graphqlUrlMatch, "/custom-gql");
  });
});
