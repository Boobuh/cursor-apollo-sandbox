import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildFillSandboxScript,
  buildRunOperationScript,
  buildSandboxIframeUrl,
  deriveGraphqlUrlMatch,
  formatVariablesJson,
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

describe("formatVariablesJson", () => {
  it("pretty-prints JSON objects with 2-space indent", () => {
    assert.equal(
      formatVariablesJson('{"paginateInput":{"page":1,"perPage":100}}'),
      '{\n  "paginateInput": {\n    "page": 1,\n    "perPage": 100\n  }\n}'
    );
    assert.equal(formatVariablesJson("{}"), "{}");
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
    assert.equal(parsed.searchParams.get("variables"), '{\n  "a": 1\n}');
    assert.equal(parsed.searchParams.get("persistExplorerState"), "false");
    assert.deepEqual(JSON.parse(parsed.searchParams.get("headers")), {
      Authorization: "Bearer tok"
    });
  });
});

describe("buildFillSandboxScript", () => {
  it("generates two-phase fill: bootstrap, wait for schema, then apply operation", () => {
    const script = buildFillSandboxScript(
      "https://dev.com/graphql",
      "query Foo { bar }",
      '{"id":"1"}',
      5000
    );
    assert.match(script, /^\(async \(\) => \{/);
    assert.match(script, /const graphqlEndpoint = "https:\/\/dev\.com\/graphql"/);
    assert.match(script, /const initWaitMs = 5000/);
    assert.match(script, /#embeddableSandbox/);
    assert.match(script, /__apolloAuth/);
    assert.match(script, /persistExplorerState/);
    assert.match(script, /formatVariablesJson/);
    assert.match(script, /JSON\.stringify\(parsed, null, 2\)/);
    assert.match(script, /buildBootstrapUrl/);
    assert.match(script, /buildFilledUrl/);
    assert.match(script, /waitForSchemaReady/);
    assert.match(script, /schemaReady/);
    assert.match(script, /addEventListener\('message', onMsg\)/);
    assert.match(script, /iframe\.src = buildBootstrapUrl\(\)/);
    assert.match(script, /iframe\.src = buildFilledUrl\(\)/);
    assert.match(script, /ExplorerListeningForHandshake/);
    assert.match(script, /HandshakeResponse/);
    assert.match(script, /IntrospectionQueryWithHeaders/);
    assert.match(script, /SchemaResponse/);
    assert.match(script, /ExplorerRequest/);
    assert.match(script, /ExplorerResponse/);
    assert.match(script, /probeEndpoint/);
    assert.doesNotMatch(script, /wait for green status timed out/);
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
