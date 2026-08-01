import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  APOLLO_SANDBOX_EMBED_ORIGIN,
  handleSandboxRelayMessage,
  isSchemaReadyGraphqlJson
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

function mockFetchResponse(body, status = 200) {
  return {
    status,
    async json() {
      return body;
    },
    headers: { forEach() {} }
  };
}

describe("sandbox-relay branch coverage", () => {
  it("isSchemaReadyGraphqlJson accepts __schema payloads", () => {
    assert.equal(isSchemaReadyGraphqlJson({ data: { __schema: { types: [] } } }), true);
  });

  it("introspection uses sandboxEndpointUrl override and includeCookies", async () => {
    const { source, posted } = mockSource();
    const requests = [];
    await handleSandboxRelayMessage(
      {
        origin: APOLLO_SANDBOX_EMBED_ORIGIN,
        data: {
          name: "IntrospectionQueryWithHeaders",
          operationId: "intro-1",
          sandboxEndpointUrl: "https://override.com/graphql",
          introspectionRequestBody: "{}",
          includeCookies: true
        },
        source
      },
      {
        graphqlEndpoint: "https://dev.com/graphql",
        capturedHeaders: {},
        parentHref: "https://dev.com/graphql",
        markSchemaReady: () => {},
        handleRequest: async (url, options) => {
          requests.push({ url, options });
          return mockFetchResponse({ data: { __schema: { types: [] } } });
        }
      }
    );
    assert.equal(requests[0]?.url, "https://override.com/graphql");
    assert.equal(requests[0]?.options.credentials, "include");
    assert.equal(posted[0].message.name, "SchemaResponse");
  });

  it("returns SchemaError when introspection response includes graphql errors", async () => {
    const { source, posted } = mockSource();
    await handleSandboxRelayMessage(
      {
        origin: APOLLO_SANDBOX_EMBED_ORIGIN,
        data: {
          name: "IntrospectionQueryWithHeaders",
          operationId: "intro-err",
          introspectionRequestBody: "{}"
        },
        source
      },
      {
        graphqlEndpoint: "https://dev.com/graphql",
        capturedHeaders: {},
        parentHref: "https://dev.com/graphql",
        markSchemaReady: () => {},
        handleRequest: async () =>
          mockFetchResponse({ errors: [{ message: "Unauthorized" }] })
      }
    );
    assert.equal(posted[0].message.name, "SchemaError");
  });
});
