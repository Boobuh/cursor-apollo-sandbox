import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  APOLLO_SANDBOX_EMBED_ORIGIN,
  handleSandboxRelayMessage,
  isSchemaReadyGraphqlJson,
  resolveSandboxRelayReply
} from "../dist/apollo/sandbox-relay.js";

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

describe("sandbox-relay edge cases", () => {
  it("resolveSandboxRelayReply ignores malformed payloads", () => {
    assert.deepEqual(
      resolveSandboxRelayReply(
        { origin: APOLLO_SANDBOX_EMBED_ORIGIN, data: null, source: null },
        { parentHref: "https://x.com" }
      ),
      { handled: false }
    );
    assert.deepEqual(
      resolveSandboxRelayReply(
        { origin: APOLLO_SANDBOX_EMBED_ORIGIN, data: { noName: true }, source: null },
        { parentHref: "https://x.com" }
      ),
      { handled: false }
    );
  });

  it("isSchemaReadyGraphqlJson rejects non-object payloads", () => {
    assert.equal(isSchemaReadyGraphqlJson(null), false);
    assert.equal(isSchemaReadyGraphqlJson({ data: null }), false);
  });

  it("ignores introspection without body or operationId", async () => {
    const { source, posted } = mockSource();
    const result = await handleSandboxRelayMessage(
      {
        origin: APOLLO_SANDBOX_EMBED_ORIGIN,
        data: {
          name: "IntrospectionQueryWithHeaders",
          operationId: "x"
        },
        source
      },
      {
        graphqlEndpoint: "https://dev.com/graphql",
        capturedHeaders: {},
        parentHref: "https://dev.com/graphql",
        markSchemaReady: () => {},
        handleRequest: async () => mockFetchResponse({ data: { __schema: {} } })
      }
    );
    assert.equal(result.handled, false);
    assert.equal(posted.length, 0);
  });

  it("returns ExplorerResponse error when operation fetch throws", async () => {
    const { source, posted } = mockSource();
    await handleSandboxRelayMessage(
      {
        origin: APOLLO_SANDBOX_EMBED_ORIGIN,
        data: {
          name: "ExplorerRequest",
          operationId: "op-2",
          endpointUrl: "https://dev.com/graphql",
          operation: "query Q { a }"
        },
        source
      },
      {
        graphqlEndpoint: "https://dev.com/graphql",
        capturedHeaders: {},
        parentHref: "https://dev.com/graphql",
        markSchemaReady: () => {},
        handleRequest: async () => {
          throw new Error("CORS blocked");
        }
      }
    );
    assert.equal(posted[0].message.name, "ExplorerResponse");
    assert.match(posted[0].message.response.error.message, /CORS blocked/);
  });

  it("handles non-Error throw values in introspection", async () => {
    const { source, posted } = mockSource();
    await handleSandboxRelayMessage(
      {
        origin: APOLLO_SANDBOX_EMBED_ORIGIN,
        data: {
          name: "IntrospectionQueryWithHeaders",
          operationId: "intro-x",
          introspectionRequestBody: "{}"
        },
        source
      },
      {
        graphqlEndpoint: "https://dev.com/graphql",
        capturedHeaders: {},
        parentHref: "https://dev.com/graphql",
        markSchemaReady: () => {},
        handleRequest: async () => {
          throw "plain failure";
        }
      }
    );
    assert.equal(posted[0].message.name, "SchemaError");
    assert.equal(posted[0].message.error, "plain failure");
  });

  it("handles non-Error throw values in explorer requests", async () => {
    const { source, posted } = mockSource();
    await handleSandboxRelayMessage(
      {
        origin: APOLLO_SANDBOX_EMBED_ORIGIN,
        data: {
          name: "ExplorerRequest",
          operationId: "op-3",
          endpointUrl: "https://dev.com/graphql",
          operation: "query Q { a }"
        },
        source
      },
      {
        graphqlEndpoint: "https://dev.com/graphql",
        capturedHeaders: {},
        parentHref: "https://dev.com/graphql",
        markSchemaReady: () => {},
        handleRequest: async () => {
          throw "plain explorer failure";
        }
      }
    );
    assert.equal(posted[0].message.name, "ExplorerResponse");
    assert.equal(posted[0].message.response.error.message, "plain explorer failure");
  });

  it("handleSandboxRelayMessage ignores wrong origin after handshake", async () => {
    const result = await handleSandboxRelayMessage(
      {
        origin: "https://evil.example",
        data: { name: "ExplorerRequest", operationId: "x" },
        source: mockSource().source
      },
      {
        graphqlEndpoint: "https://dev.com/graphql",
        capturedHeaders: {},
        parentHref: "https://dev.com/graphql",
        markSchemaReady: () => {},
        handleRequest: async () => mockFetchResponse({ data: { __typename: "Query" } })
      }
    );
    assert.equal(result.handled, false);
  });

  it("handleSandboxRelayMessage ignores non-object payloads", async () => {
    const result = await handleSandboxRelayMessage(
      {
        origin: APOLLO_SANDBOX_EMBED_ORIGIN,
        data: "not-an-object",
        source: mockSource().source
      },
      {
        graphqlEndpoint: "https://dev.com/graphql",
        capturedHeaders: {},
        parentHref: "https://dev.com/graphql",
        markSchemaReady: () => {},
        handleRequest: async () => mockFetchResponse({ data: { __typename: "Query" } })
      }
    );
    assert.equal(result.handled, false);
  });

  it("marks schema ready on successful explorer responses", async () => {
    let schemaReady = false;
    const { source, posted } = mockSource();
    await handleSandboxRelayMessage(
      {
        origin: APOLLO_SANDBOX_EMBED_ORIGIN,
        data: {
          name: "ExplorerRequest",
          operationId: "op-ok",
          endpointUrl: "https://dev.com/graphql",
          operation: "query Q { __typename }"
        },
        source
      },
      {
        graphqlEndpoint: "https://dev.com/graphql",
        capturedHeaders: { Authorization: "Bearer x" },
        parentHref: "https://dev.com/graphql",
        markSchemaReady: () => {
          schemaReady = true;
        },
        handleRequest: async () =>
          mockFetchResponse(
            { data: { __typename: "Query" } },
            200,
            { "content-type": "application/json" }
          )
      }
    );
    assert.equal(schemaReady, true);
    assert.equal(posted[0].message.name, "ExplorerResponse");
    assert.equal(posted[0].message.response.status, 200);
  });
});

function mockFetchResponse(body, status = 200, headerEntries = {}) {
  return {
    status,
    async json() {
      return body;
    },
    headers: {
      forEach(callback) {
        for (const [key, value] of Object.entries(headerEntries)) {
          callback(value, key);
        }
      }
    }
  };
}
