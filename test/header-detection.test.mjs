import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildAutoDetectHeadersScript,
  buildInstallPersistentTrafficHookScript,
  buildPersistHeadersScript,
  buildReadCachedGraphqlRequestScript,
  filterGraphqlTrafficHeaders,
  hasRealGraphqlOperation,
  isAllowedGraphqlTrafficHeader,
  isTrafficHeaderSource,
  isTrivialProbeQuery,
  mergeDetectedHeaders,
  mergeTrafficCapture,
  mergeTrafficHeadersOnly,
  parseGraphqlRequestBody
} from "../dist/apollo/header-detection.js";

describe("isAllowedGraphqlTrafficHeader", () => {
  it("allows graphql traffic custom headers only", () => {
    assert.equal(isAllowedGraphqlTrafficHeader("Authorization"), true);
    assert.equal(isAllowedGraphqlTrafficHeader("X-Company-Id"), true);
    assert.equal(isAllowedGraphqlTrafficHeader("X-Role-Assignment-Id"), true);
    assert.equal(isAllowedGraphqlTrafficHeader("X-Language-Id"), true);
    assert.equal(isAllowedGraphqlTrafficHeader("X-Datadog-Origin"), false);
    assert.equal(isAllowedGraphqlTrafficHeader("Sec-Fetch-Mode"), false);
  });
});

describe("filterGraphqlTrafficHeaders", () => {
  it("keeps only graphql POST custom headers from network", () => {
    const filtered = filterGraphqlTrafficHeaders({
      Authorization: "Bearer abc",
      "X-Company-Id": "co-1",
      "X-Datadog-Trace-Id": "123",
      "Content-Type": "application/json",
      Accept: "*/*"
    });
    assert.deepEqual(filtered, {
      Authorization: "Bearer abc",
      "X-Company-Id": "co-1"
    });
  });
});

describe("parseGraphqlRequestBody", () => {
  it("extracts query and variables from POST JSON", () => {
    const parsed = parseGraphqlRequestBody(
      JSON.stringify({
        query: "query Foo { bar }",
        variables: { id: "1" },
        operationName: "Foo"
      })
    );
    assert.equal(parsed.query, "query Foo { bar }");
    assert.deepEqual(parsed.variables, { id: "1" });
    assert.equal(parsed.operationName, "Foo");
  });
});

describe("isTrivialProbeQuery", () => {
  it("detects typename probes", () => {
    assert.equal(isTrivialProbeQuery("{ __typename }"), true);
    assert.equal(isTrivialProbeQuery("query ExampleQuery { __typename }"), true);
    assert.equal(isTrivialProbeQuery("query Employees { items { id } }"), false);
    assert.equal(isTrivialProbeQuery("query IntrospectionQuery { __schema { types { name } } }"), true);
  });
});

describe("hasRealGraphqlOperation", () => {
  it("accepts only non-probe captured operations", () => {
    assert.equal(
      hasRealGraphqlOperation({ headers: {}, operation: "query Foo { bar }" }),
      true
    );
    assert.equal(
      hasRealGraphqlOperation({
        headers: {},
        operation: "query ExampleQuery { __typename }"
      }),
      false
    );
  });
});

describe("mergeDetectedHeaders", () => {
  it("merges headers and flags from multiple parts", () => {
    const merged = mergeDetectedHeaders(
      { headers: { Authorization: "Bearer a" }, graphqlSeen: true },
      {
        headers: { "X-Company-Id": "1" },
        operation: "query Employees { items { id } }",
        variablesJson: '{"filter":{}}',
        probeOk: true,
        sources: ["traffic"]
      },
      null,
      undefined
    );
    assert.deepEqual(merged.headers, {
      Authorization: "Bearer a",
      "X-Company-Id": "1"
    });
    assert.match(merged.operation, /Employees/);
    assert.equal(merged.variablesJson, '{\n  "filter": {}\n}');
    assert.equal(merged.graphqlSeen, true);
    assert.equal(merged.probeOk, true);
    assert.deepEqual(merged.sources, ["traffic"]);
  });

  it("prefers non-probe operations when merging", () => {
    const merged = mergeDetectedHeaders(
      {
        headers: { Authorization: "Bearer a" },
        operation: "query ExampleQuery { __typename }",
        variablesJson: "{}",
        sources: ["traffic"]
      },
      {
        headers: { Authorization: "Bearer a" },
        operation: "query Employees { items { id } }",
        variablesJson: '{"take":10}',
        sources: ["apollo-link"]
      }
    );
    assert.match(merged.operation, /Employees/);
    assert.equal(merged.variablesJson, '{\n  "take": 10\n}');
  });
});

describe("mergeTrafficHeadersOnly", () => {
  it("ignores non-traffic sources", () => {
    const merged = mergeTrafficHeadersOnly(
      {
        headers: { Authorization: "Bearer stale" },
        sources: ["storage"],
        probeOk: true
      },
      {
        headers: {
          Authorization: "Bearer live",
          "X-Company-Id": "1"
        },
        sources: ["traffic"],
        probeOk: true
      }
    );
    assert.deepEqual(merged.headers, {
      Authorization: "Bearer live",
      "X-Company-Id": "1"
    });
    assert.deepEqual(merged.sources, ["traffic"]);
  });

  it("accepts apollo-link source", () => {
    const merged = mergeTrafficHeadersOnly({
      headers: { Authorization: "Bearer x", "X-Company-Id": "1" },
      sources: ["apollo-link"],
      probeOk: true
    });
    assert.equal(isTrafficHeaderSource("apollo-link"), true);
    assert.equal(merged.headers.Authorization, "Bearer x");
  });
});

describe("buildPersistHeadersScript", () => {
  it("writes __apolloAuth payload to sessionStorage", () => {
    const script = buildPersistHeadersScript(
      {
        headers: { Authorization: "Bearer x" },
        operation: "query Employees { items { id } }",
        variablesJson: '{"filter":{}}'
      },
      { probeOk: true, sources: ["cross-tab"] }
    );
    assert.match(script, /^sessionStorage\.setItem\('__apolloAuth',/);
    const jsonPart = script.match(
      /sessionStorage\.setItem\('__apolloAuth', (.+)\); true;$/
    )?.[1];
    assert.ok(jsonPart);
    const payload = JSON.parse(JSON.parse(jsonPart));
    assert.deepEqual(payload.headers, { Authorization: "Bearer x" });
    assert.match(payload.operation, /Employees/);
    assert.equal(payload.variablesJson, '{"filter":{}}');
    assert.equal(payload.probeOk, true);
    assert.deepEqual(payload.sources, ["cross-tab"]);
  });
});

describe("mergeTrafficCapture", () => {
  it("merges headers from traffic and operation from session cache", () => {
    const merged = mergeTrafficCapture(
      {
        headers: { Authorization: "Bearer live", "X-Company-Id": "1" },
        sources: ["traffic"],
        probeOk: true
      },
      {
        headers: { Authorization: "Bearer stale" },
        operation: "query Employees { items { id } }",
        variablesJson: '{"take":10}',
        sources: ["session-cache"]
      }
    );
    assert.equal(merged.headers.Authorization, "Bearer live");
    assert.match(merged.operation, /Employees/);
    assert.equal(merged.variablesJson, '{\n  "take": 10\n}');
  });
});

describe("buildReadCachedGraphqlRequestScript", () => {
  it("reads cached graphql request payload shape", () => {
    const script = buildReadCachedGraphqlRequestScript();
    assert.match(script, /__apolloLastGraphqlRequest/);
    assert.match(script, /session-cache/);
  });
});

describe("buildInstallPersistentTrafficHookScript", () => {
  it("installs durable graphql traffic hooks", () => {
    const script = buildInstallPersistentTrafficHookScript();
    assert.match(script, /__apolloSandboxTrafficHook/);
    assert.match(script, /__apolloLastGraphqlRequest/);
  });
});

describe("buildAutoDetectHeadersScript", () => {
  it("hooks fetch/xhr and filters graphql traffic headers", () => {
    const script = buildAutoDetectHeadersScript(
      "https://dev.com/graphql",
      "/graphql",
      6000
    );
    assert.match(script, /^\(async \(\) => \{/);
    assert.match(script, /const graphqlUrl = "https:\/\/dev\.com\/graphql"/);
    assert.match(script, /x-company-id/);
    assert.match(script, /x-datadog-/);
    assert.match(script, /provokeRealGraphqlTraffic/);
    assert.match(script, /refetchQueries/);
    assert.match(script, /hasRealQuery/);
    assert.match(script, /replayCachedGraphqlRequest/);
    assert.match(script, /readFetchBody/);
    assert.doesNotMatch(script, /global-company/);
    assert.doesNotMatch(script, /cookie-only/);
  });
});
