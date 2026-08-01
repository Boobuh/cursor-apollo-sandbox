import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildFillSandboxScript } from "../dist/apollo/sandbox.js";
import {
  APOLLO_SANDBOX_EMBED_ORIGIN,
  ApolloSandboxMessage,
  LegacyBrokenRelayPatterns,
  computePostFillSettleMs,
  getHeadersWithContentType,
  getHeadersWithContentTypeOnly,
  handleSandboxRelayMessage,
  isSchemaReadyGraphqlJson,
  resolveSandboxRelayReply
} from "../dist/apollo/sandbox-relay.js";

const ENDPOINT = "https://dev.example.com/graphql";
const CAPTURED = {
  Authorization: "Bearer live",
  "X-Company-Id": "co-1"
};

function mockSource() {
  const posted = [];
  return {
    posted,
    source: {
      postMessage(message, origin) {
        posted.push({ message, origin });
      }
    }
  };
}

function mockFetchResponse(body, status = 200) {
  return {
    status,
    async json() {
      return body;
    },
    headers: {
      forEach(callback) {
        callback("application/json", "content-type");
      }
    }
  };
}

function relayCtx(overrides = {}) {
  let schemaReady = false;
  const requests = [];
  return {
    requests,
    get schemaReady() {
      return schemaReady;
    },
    ctx: {
      graphqlEndpoint: ENDPOINT,
      capturedHeaders: CAPTURED,
      parentHref: "https://dev.example.com/graphql",
      markSchemaReady: () => {
        schemaReady = true;
      },
      handleRequest: async (url, options) => {
        requests.push({ url, options });
        return mockFetchResponse({ data: { __typename: "Query" } });
      },
      ...overrides
    }
  };
}

describe("ApolloSandboxMessage", () => {
  it("matches embeddable-explorer constant strings", () => {
    assert.equal(
      ApolloSandboxMessage.EXPLORER_LISTENING_FOR_HANDSHAKE,
      "ExplorerListeningForHandshake"
    );
    assert.equal(
      ApolloSandboxMessage.INTROSPECTION_QUERY_WITH_HEADERS,
      "IntrospectionQueryWithHeaders"
    );
    assert.equal(
      ApolloSandboxMessage.EXPLORER_QUERY_MUTATION_REQUEST,
      "ExplorerRequest"
    );
    assert.equal(
      ApolloSandboxMessage.EXPLORER_QUERY_MUTATION_RESPONSE,
      "ExplorerResponse"
    );
  });
});

describe("computePostFillSettleMs", () => {
  it("clamps settle time from init wait", () => {
    assert.equal(computePostFillSettleMs(5000), 833);
    assert.equal(computePostFillSettleMs(12000), 2000);
    assert.equal(computePostFillSettleMs(3000), 800);
  });
});

describe("getHeadersWithContentType", () => {
  it("adds content-type and merges captured auth headers", () => {
    assert.deepEqual(getHeadersWithContentType({}, CAPTURED), {
      "Content-Type": "application/json",
      Authorization: "Bearer live",
      "X-Company-Id": "co-1"
    });
  });

  it("does not duplicate content-type when already set", () => {
    assert.deepEqual(
      getHeadersWithContentTypeOnly({ "content-type": "application/graphql" }),
      { "content-type": "application/graphql" }
    );
  });
});

describe("isSchemaReadyGraphqlJson", () => {
  it("detects __schema and __typename success payloads", () => {
    assert.equal(isSchemaReadyGraphqlJson({ data: { __schema: {} } }), true);
    assert.equal(isSchemaReadyGraphqlJson({ data: { __typename: "Query" } }), true);
    assert.equal(isSchemaReadyGraphqlJson({ data: null }), false);
    assert.equal(isSchemaReadyGraphqlJson({ errors: [{ message: "nope" }] }), false);
  });
});

describe("resolveSandboxRelayReply", () => {
  it("ignores non-embed origins", () => {
    const result = resolveSandboxRelayReply(
      {
        origin: "https://evil.example.com",
        data: { name: ApolloSandboxMessage.EXPLORER_LISTENING_FOR_HANDSHAKE },
        source: null
      },
      { parentHref: "https://dev.example.com/graphql" }
    );
    assert.deepEqual(result, { handled: false });
  });

  it("returns HandshakeResponse for ExplorerListeningForHandshake", () => {
    const result = resolveSandboxRelayReply(
      {
        origin: APOLLO_SANDBOX_EMBED_ORIGIN,
        data: { name: ApolloSandboxMessage.EXPLORER_LISTENING_FOR_HANDSHAKE },
        source: null
      },
      { parentHref: "https://dev.example.com/graphql" }
    );
    assert.equal(result.handled, true);
    assert.deepEqual(result.outbound, {
      name: ApolloSandboxMessage.HANDSHAKE_RESPONSE,
      parentHref: "https://dev.example.com/graphql"
    });
  });
});

describe("handleSandboxRelayMessage", () => {
  it("posts HandshakeResponse to embed source", async () => {
    const { source, posted } = mockSource();
    const { ctx } = relayCtx();
    const result = await handleSandboxRelayMessage(
      {
        origin: APOLLO_SANDBOX_EMBED_ORIGIN,
        data: { name: ApolloSandboxMessage.EXPLORER_LISTENING_FOR_HANDSHAKE },
        source
      },
      ctx
    );
    assert.equal(result.handled, true);
    assert.equal(posted.length, 1);
    assert.equal(posted[0].message.name, ApolloSandboxMessage.HANDSHAKE_RESPONSE);
    assert.equal(posted[0].origin, APOLLO_SANDBOX_EMBED_ORIGIN);
  });

  it("handles IntrospectionQueryWithHeaders with SchemaResponse", async () => {
    const { source, posted } = mockSource();
    const requests = [];
    const harness = relayCtx({
      handleRequest: async (url, options) => {
        requests.push({ url, options });
        return mockFetchResponse({
          data: { __schema: { types: [] } }
        });
      }
    });

    const result = await handleSandboxRelayMessage(
      {
        origin: APOLLO_SANDBOX_EMBED_ORIGIN,
        data: {
          name: ApolloSandboxMessage.INTROSPECTION_QUERY_WITH_HEADERS,
          operationId: "intro-1",
          sandboxEndpointUrl: ENDPOINT,
          introspectionRequestBody: JSON.stringify({ query: "{ __schema { types { name } } }" }),
          introspectionRequestHeaders: { "X-Language-Id": "en" }
        },
        source
      },
      harness.ctx
    );

    assert.equal(result.handled, true);
    assert.equal(harness.schemaReady, true);
    assert.equal(posted[0].message.name, ApolloSandboxMessage.SCHEMA_RESPONSE);
    assert.deepEqual(posted[0].message.schema, { __schema: { types: [] } });
    assert.match(requests[0].options.headers.Authorization, /Bearer live/);
    assert.equal(requests[0].options.headers["X-Language-Id"], "en");
  });

  it("returns SchemaError when introspection responds with GraphQL errors", async () => {
    const { source, posted } = mockSource();
    const harness = relayCtx({
      handleRequest: async () =>
        mockFetchResponse({ errors: [{ message: "Unauthorized" }] })
    });

    await handleSandboxRelayMessage(
      {
        origin: APOLLO_SANDBOX_EMBED_ORIGIN,
        data: {
          name: ApolloSandboxMessage.INTROSPECTION_QUERY_WITH_HEADERS,
          operationId: "intro-2",
          introspectionRequestBody: "{}",
          introspectionRequestHeaders: {}
        },
        source
      },
      harness.ctx
    );

    assert.equal(posted[0].message.name, ApolloSandboxMessage.SCHEMA_ERROR);
    assert.equal(harness.schemaReady, false);
  });

  it("returns SchemaError when introspection fetch throws", async () => {
    const { source, posted } = mockSource();
    const harness = relayCtx({
      handleRequest: async () => {
        throw new Error("network down");
      }
    });

    await handleSandboxRelayMessage(
      {
        origin: APOLLO_SANDBOX_EMBED_ORIGIN,
        data: {
          name: ApolloSandboxMessage.INTROSPECTION_QUERY_WITH_HEADERS,
          operationId: "intro-3",
          introspectionRequestBody: "{}",
          introspectionRequestHeaders: {}
        },
        source
      },
      harness.ctx
    );

    assert.equal(posted[0].message.name, ApolloSandboxMessage.SCHEMA_ERROR);
    assert.match(posted[0].message.error, /network down/);
  });

  it("handles ExplorerRequest with ExplorerResponse", async () => {
    const { source, posted } = mockSource();
    const harness = relayCtx({
      handleRequest: async () =>
        mockFetchResponse({ data: { users: [{ id: "1" }] } }, 200)
    });

    await handleSandboxRelayMessage(
      {
        origin: APOLLO_SANDBOX_EMBED_ORIGIN,
        data: {
          name: ApolloSandboxMessage.EXPLORER_QUERY_MUTATION_REQUEST,
          operationId: "op-1",
          endpointUrl: ENDPOINT,
          operation: "query Users { users { id } }",
          variables: { take: 10 },
          headers: { "X-Language-Id": "en" }
        },
        source
      },
      harness.ctx
    );

    assert.equal(posted[0].message.name, ApolloSandboxMessage.EXPLORER_QUERY_MUTATION_RESPONSE);
    assert.deepEqual(posted[0].message.response.data, { users: [{ id: "1" }] });
    assert.equal(posted[0].message.response.status, 200);
    assert.equal(harness.schemaReady, false);
  });

  it("ignores legacy broken message names from pre-0.6.5 relay", async () => {
    const { source, posted } = mockSource();
    const { ctx } = relayCtx();

    for (const legacyName of [
      "QueryMutationRequest",
      "IntrospectionQuery",
      "explorerQueryMutationResponse"
    ]) {
      const result = await handleSandboxRelayMessage(
        {
          origin: APOLLO_SANDBOX_EMBED_ORIGIN,
          data: { name: legacyName, operationId: "x" },
          source
        },
        ctx
      );
      assert.equal(result.handled, false);
    }
    assert.equal(posted.length, 0);
  });
});

describe("buildFillSandboxScript protocol guard", () => {
  it("embeds official Apollo message constants and avoids legacy broken patterns", () => {
    const script = buildFillSandboxScript(ENDPOINT, "query Q { a }", "{}", 9000);
    for (const name of Object.values(ApolloSandboxMessage)) {
      assert.match(script, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    for (const legacy of LegacyBrokenRelayPatterns) {
      assert.doesNotMatch(script, new RegExp(`name: '${legacy}'`));
      assert.doesNotMatch(script, new RegExp(`name: "${legacy}"`));
    }
    assert.match(script, /iframe\.src = buildBootstrapUrl\(\)/);
    assert.match(script, /iframe\.src = buildFilledUrl\(\)/);
    assert.match(script, /ok: true/);
    assert.doesNotMatch(script, /wait for green status timed out/);
  });
});
