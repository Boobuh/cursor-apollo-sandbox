import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildFillSandboxScript,
  buildRunOperationScript,
  buildSandboxIframeUrl,
  deriveGraphqlUrlMatch,
  parseVariablesJson
} from "../dist/apollo/sandbox.js";

describe("deriveGraphqlUrlMatch", () => {
  it("uses pathname from graphql URL", () => {
    assert.equal(
      deriveGraphqlUrlMatch("https://dev.com/api/graphql"),
      "/api/graphql"
    );
  });

  it("defaults to /graphql for root or invalid URLs", () => {
    assert.equal(deriveGraphqlUrlMatch("https://dev.com/"), "/graphql");
    assert.equal(deriveGraphqlUrlMatch("not-valid"), "/graphql");
  });
});

describe("parseVariablesJson", () => {
  it("parses object JSON", () => {
    assert.deepEqual(parseVariablesJson('{"id": "abc"}'), { id: "abc" });
    assert.deepEqual(parseVariablesJson(""), {});
  });

  it("rejects arrays and invalid JSON", () => {
    assert.throws(() => parseVariablesJson("[]"), /JSON object/);
    assert.throws(() => parseVariablesJson("{bad"), /valid JSON/);
    assert.throws(() => parseVariablesJson("null"), /JSON object/);
  });
});

describe("buildSandboxIframeUrl", () => {
  it("embeds endpoint, document, variables, and headers", () => {
    const url = buildSandboxIframeUrl(
      "http://localhost:3001/graphql",
      { headers: { Authorization: "Bearer tok" } },
      "query { __typename }",
      '{"a":1}'
    );
    const parsed = new URL(url);
    assert.equal(parsed.hostname, "sandbox.embed.apollographql.com");
    assert.equal(parsed.searchParams.get("endpoint"), "http://localhost:3001/graphql");
    assert.equal(parsed.searchParams.get("document"), "query { __typename }");
    assert.equal(parsed.searchParams.get("variables"), '{"a":1}');
    assert.deepEqual(JSON.parse(parsed.searchParams.get("headers")), {
      Authorization: "Bearer tok"
    });
  });
});

describe("buildFillSandboxScript", () => {
  it("generates async IIFE with iframe URL and wait time", () => {
    const script = buildFillSandboxScript("https://sandbox.example/iframe", 5000);
    assert.match(script, /^\(async \(\) => \{/);
    assert.match(script, /const iframeUrl = "https:\/\/sandbox\.example\/iframe"/);
    assert.match(script, /const waitMs = 5000/);
    assert.match(script, /#embeddableSandbox/);
    assert.match(script, /__apolloAuth/);
    assert.match(script, /QueryMutationRequest/);
  });
});

describe("buildRunOperationScript", () => {
  it("inlines normalized query and parsed variables", () => {
    const script = buildRunOperationScript(
      "http://localhost:3001/graphql",
      "query  Foo  {\n  __typename\n}",
      '{"limit": 10}'
    );
    assert.match(script, /const query = "query Foo \{ __typename \}"/);
    assert.match(script, /const variables = \{"limit":10\}/);
    assert.match(
      script,
      /fetch\("http:\/\/localhost:3001\/graphql"/
    );
  });
});
