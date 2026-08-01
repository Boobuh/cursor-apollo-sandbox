import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  collectTargetHosts,
  captureSummary,
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
      /Captured 2 header\(s\) from GraphQL network traffic: Authorization, X-Company-Id/
    );
  });

  it("describes cookie-only sessions", () => {
    assert.match(
      headerSummary({
        headers: {},
        probeOk: false,
        sources: ["no-graphql-traffic"]
      }),
      /No GraphQL traffic headers captured/
    );
  });

  it("describes traffic capture", () => {
    assert.match(
      headerSummary({
        headers: { Authorization: "Bearer x", "X-Company-Id": "1" },
        probeOk: true,
        sources: ["traffic"]
      }),
      /Captured 2 header\(s\) from GraphQL network traffic/
    );
  });

  it("handles empty detection", () => {
    assert.match(
      headerSummary({ headers: {}, sources: ["no-graphql-traffic"] }),
      /No GraphQL traffic headers captured/
    );
  });
});

describe("captureSummary", () => {
  it("describes traffic capture without probe verification", () => {
    assert.match(
      headerSummary({
        headers: { Authorization: "Bearer x" },
        probeOk: false,
        sources: ["traffic"]
      }),
      /Captured 1 header\(s\) from GraphQL network traffic/
    );
    assert.doesNotMatch(
      headerSummary({
        headers: { Authorization: "Bearer x" },
        probeOk: false,
        sources: ["traffic"]
      }),
      /probe OK/
    );
  });

  it("captureSummary omits variables hint for empty object", () => {
    assert.match(
      captureSummary({
        headers: { Authorization: "Bearer x" },
        operation: "query Employees { items { id name extra field names here } }",
        variablesJson: "{}",
        sources: ["traffic"],
        probeOk: true
      }),
      /Operation from traffic:/
    );
    assert.doesNotMatch(
      captureSummary({
        headers: { Authorization: "Bearer x" },
        operation: "query Employees { items { id name extra field names here } }",
        variablesJson: "{}",
        sources: ["traffic"],
        probeOk: true
      }),
      /\+ variables/
    );
  });

  it("includes operation preview when captured from traffic", () => {
    assert.match(
      captureSummary({
        headers: { Authorization: "Bearer x" },
        operation: "query Employees { items { id name } }",
        variablesJson: '{"filter":{"search":"a"}}',
        sources: ["traffic"],
        probeOk: true
      }),
      /Operation from traffic: query Employees \{ items \{ id name \} \}/
    );
    assert.match(
      captureSummary({
        headers: { Authorization: "Bearer x" },
        operation: "query Employees { items { id name } }",
        variablesJson: '{"filter":{"search":"a"}}',
        sources: ["traffic"],
        probeOk: true
      }),
      /\+ variables/
    );
  });
});
