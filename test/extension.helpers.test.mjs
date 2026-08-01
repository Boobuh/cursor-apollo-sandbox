import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  collectTargetHosts,
  endpointHint,
  headerSummary
} from "../dist/extension.helpers.js";

const baseResolved = {
  authCaptureUrl: "https://app.dev.com/login",
  graphqlUrl: "https://dev.com/graphql",
  graphqlUrlFromBrowserTab: false,
  graphqlUrlMatch: "/graphql",
  sandboxWaitMs: 9000,
  headerDetectMs: 6000,
  defaultOperation: "query { __typename }",
  defaultVariablesJson: "{}",
  graphqlUrlSource: "settings"
};

describe("collectTargetHosts", () => {
  it("collects hostnames from graphql and auth capture URLs", () => {
    const hosts = collectTargetHosts(baseResolved);
    assert.deepEqual([...hosts].sort(), ["app.dev.com", "dev.com"]);
  });

  it("ignores invalid URLs", () => {
    const hosts = collectTargetHosts({
      ...baseResolved,
      authCaptureUrl: "not-a-url"
    });
    assert.deepEqual([...hosts], ["dev.com"]);
  });
});

describe("endpointHint", () => {
  it("returns empty for settings source", () => {
    assert.equal(endpointHint(baseResolved), "");
  });

  it("describes browser tab source", () => {
    assert.match(
      endpointHint({ ...baseResolved, graphqlUrlSource: "browserTab" }),
      /endpoint from browser tab/
    );
  });
});

describe("headerSummary", () => {
  it("lists detected header keys", () => {
    assert.match(
      headerSummary({
        headers: { Authorization: "Bearer x", "X-Company-Id": "1" },
        sources: ["traffic"],
        probeOk: true
      }),
      /Auto-detected 2 header\(s\): Authorization, X-Company-Id/
    );
  });

  it("describes cookie-only sessions", () => {
    assert.match(
      headerSummary({ headers: {}, probeOk: true, sources: ["probe:cookie-only"] }),
      /Using cookie session for GraphQL/
    );
  });

  it("handles empty detection", () => {
    assert.match(
      headerSummary({ headers: {}, sources: ["storage"] }),
      /No extra headers detected/
    );
  });
});
