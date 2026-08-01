"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LegacyBrokenRelayPatterns = exports.ApolloSandboxMessage = exports.APOLLO_SANDBOX_EMBED_ORIGIN = void 0;
exports.computePostFillSettleMs = computePostFillSettleMs;
exports.getHeadersWithContentType = getHeadersWithContentType;
exports.getHeadersWithContentTypeOnly = getHeadersWithContentTypeOnly;
exports.isSchemaReadyGraphqlJson = isSchemaReadyGraphqlJson;
exports.resolveSandboxRelayReply = resolveSandboxRelayReply;
exports.handleSandboxRelayMessage = handleSandboxRelayMessage;
exports.buildSandboxRelayBrowserFragment = buildSandboxRelayBrowserFragment;
/**
 * Message names from @apollo/sandbox embeddable-explorer
 * (packages/sandbox/src/helpers/constants.ts).
 */
exports.APOLLO_SANDBOX_EMBED_ORIGIN = "https://sandbox.embed.apollographql.com";
exports.ApolloSandboxMessage = {
    EXPLORER_LISTENING_FOR_HANDSHAKE: "ExplorerListeningForHandshake",
    HANDSHAKE_RESPONSE: "HandshakeResponse",
    INTROSPECTION_QUERY_WITH_HEADERS: "IntrospectionQueryWithHeaders",
    SCHEMA_RESPONSE: "SchemaResponse",
    SCHEMA_ERROR: "SchemaError",
    EXPLORER_QUERY_MUTATION_REQUEST: "ExplorerRequest",
    EXPLORER_QUERY_MUTATION_RESPONSE: "ExplorerResponse"
};
/** @deprecated Wrong names from pre-0.6.5 relay — must not match live embed traffic. */
exports.LegacyBrokenRelayPatterns = [
    "QueryMutationRequest",
    "explorerQueryMutationResponse",
    "IntrospectionQuery"
];
function computePostFillSettleMs(initWaitMs) {
    return Math.min(2000, Math.max(800, Math.floor(initWaitMs / 6)));
}
function getHeadersWithContentType(headers, capturedHeaders) {
    const merged = {
        ...getHeadersWithContentTypeOnly(headers),
        ...capturedHeaders
    };
    return getHeadersWithContentTypeOnly(merged);
}
function getHeadersWithContentTypeOnly(headers) {
    const h = { ...(headers ?? {}) };
    if (!Object.keys(h).some((key) => key.toLowerCase() === "content-type")) {
        h["Content-Type"] = "application/json";
    }
    return h;
}
function isSchemaReadyGraphqlJson(json) {
    if (!json || typeof json !== "object")
        return false;
    const data = json.data;
    if (!data || typeof data !== "object")
        return false;
    return Boolean(data.__schema ?? data.__typename);
}
function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function postToEmbed(message, event) {
    event.source?.postMessage(message, event.origin || exports.APOLLO_SANDBOX_EMBED_ORIGIN);
}
/** Pure resolver: maps inbound embed postMessage → outbound reply (no I/O). */
function resolveSandboxRelayReply(event, ctx) {
    if (event.origin !== exports.APOLLO_SANDBOX_EMBED_ORIGIN) {
        return { handled: false };
    }
    const data = event.data;
    if (!isRecord(data) || typeof data.name !== "string") {
        return { handled: false };
    }
    if (data.name === exports.ApolloSandboxMessage.EXPLORER_LISTENING_FOR_HANDSHAKE) {
        return {
            handled: true,
            outbound: {
                name: exports.ApolloSandboxMessage.HANDSHAKE_RESPONSE,
                parentHref: ctx.parentHref
            }
        };
    }
    return { handled: false };
}
/** Handle Apollo Sandbox embed postMessage (async fetch for introspection/operations). */
async function handleSandboxRelayMessage(event, ctx) {
    const immediate = resolveSandboxRelayReply(event, ctx);
    if (immediate.handled) {
        postToEmbed(immediate.outbound, event);
        return immediate;
    }
    if (event.origin !== exports.APOLLO_SANDBOX_EMBED_ORIGIN) {
        return { handled: false };
    }
    const data = event.data;
    if (!isRecord(data) || typeof data.name !== "string") {
        return { handled: false };
    }
    if (data.name === exports.ApolloSandboxMessage.INTROSPECTION_QUERY_WITH_HEADERS) {
        const endpointUrl = typeof data.sandboxEndpointUrl === "string"
            ? data.sandboxEndpointUrl
            : ctx.graphqlEndpoint;
        const operationId = data.operationId;
        const introspectionRequestBody = typeof data.introspectionRequestBody === "string"
            ? data.introspectionRequestBody
            : undefined;
        const introspectionRequestHeaders = isRecord(data.introspectionRequestHeaders)
            ? data.introspectionRequestHeaders
            : {};
        if (!introspectionRequestBody || operationId === undefined) {
            return { handled: false };
        }
        try {
            const res = await ctx.handleRequest(endpointUrl, {
                method: "POST",
                headers: getHeadersWithContentType(introspectionRequestHeaders, ctx.capturedHeaders),
                body: introspectionRequestBody,
                credentials: data.includeCookies ? "include" : "omit"
            });
            const json = await res.json();
            if (isSchemaReadyGraphqlJson(json)) {
                ctx.markSchemaReady();
            }
            const errors = json?.errors;
            const outbound = Array.isArray(errors) && errors.length
                ? {
                    name: exports.ApolloSandboxMessage.SCHEMA_ERROR,
                    errors,
                    operationId
                }
                : {
                    name: exports.ApolloSandboxMessage.SCHEMA_RESPONSE,
                    schema: json.data,
                    operationId
                };
            postToEmbed(outbound, event);
            return { handled: true, outbound };
        }
        catch (error) {
            const outbound = {
                name: exports.ApolloSandboxMessage.SCHEMA_ERROR,
                error: error instanceof Error ? error.message : String(error),
                operationId
            };
            postToEmbed(outbound, event);
            return { handled: true, outbound };
        }
    }
    if (data.name === exports.ApolloSandboxMessage.EXPLORER_QUERY_MUTATION_REQUEST &&
        typeof data.operation === "string" &&
        data.operationId !== undefined &&
        typeof data.endpointUrl === "string") {
        const operationId = data.operationId;
        const endpointUrl = data.endpointUrl;
        const headers = isRecord(data.headers)
            ? data.headers
            : {};
        const variables = isRecord(data.variables)
            ? data.variables
            : {};
        try {
            const res = await ctx.handleRequest(endpointUrl, {
                method: "POST",
                headers: getHeadersWithContentType(headers, ctx.capturedHeaders),
                body: JSON.stringify({
                    query: data.operation,
                    variables,
                    operationName: typeof data.operationName === "string" ? data.operationName : undefined
                }),
                credentials: data.includeCookies ? "include" : "omit"
            });
            const responseHeaders = {};
            res.headers.forEach((value, key) => {
                responseHeaders[key] = value;
            });
            const json = await res.json();
            if (isSchemaReadyGraphqlJson(json)) {
                ctx.markSchemaReady();
            }
            const outbound = {
                name: exports.ApolloSandboxMessage.EXPLORER_QUERY_MUTATION_RESPONSE,
                operationId,
                response: {
                    ...json,
                    status: res.status,
                    headers: responseHeaders,
                    hasNext: false
                }
            };
            postToEmbed(outbound, event);
            return { handled: true, outbound };
        }
        catch (error) {
            const outbound = {
                name: exports.ApolloSandboxMessage.EXPLORER_QUERY_MUTATION_RESPONSE,
                operationId,
                response: {
                    data: null,
                    error: {
                        message: error instanceof Error ? error.message : String(error)
                    },
                    hasNext: false
                }
            };
            postToEmbed(outbound, event);
            return { handled: true, outbound };
        }
    }
    return { handled: false };
}
/** Browser IIFE fragment: relay + schema-ready helpers (injected into fill script). */
function buildSandboxRelayBrowserFragment() {
    const msg = JSON.stringify(exports.ApolloSandboxMessage);
    const origin = JSON.stringify(exports.APOLLO_SANDBOX_EMBED_ORIGIN);
    return `
  const MSG = ${msg};
  const EMBED_ORIGIN = ${origin};
  let schemaReady = false;
  const markSchemaReadyFromJson = (json) => {
    if (schemaReady || !json) return;
    if (json?.data?.__schema || json?.data?.__typename) schemaReady = true;
  };
  const getHeadersWithContentType = (headers) => {
    const h = { ...(headers || {}) };
    if (!Object.keys(h).some((key) => key.toLowerCase() === 'content-type')) {
      h['Content-Type'] = 'application/json';
    }
    return h;
  };
  const handleRequest = async (url, options) =>
    fetch(url || graphqlEndpoint, {
      ...(options || {}),
      headers: { ...getHeadersWithContentType(options?.headers), ...headerObj },
      credentials: options?.credentials ?? 'include'
    });
  const postToEmbed = (message, source, origin) => {
    try {
      source?.postMessage(message, origin || EMBED_ORIGIN);
    } catch {}
  };
  const onMsg = async (event) => {
    if (event.origin !== EMBED_ORIGIN) return;
    const data = event.data;
    if (!data || typeof data !== 'object' || !('name' in data)) return;

    if (data.name === MSG.EXPLORER_LISTENING_FOR_HANDSHAKE) {
      postToEmbed({ name: MSG.HANDSHAKE_RESPONSE, parentHref: location.href }, event.source, event.origin);
      return;
    }

    if (data.name === MSG.INTROSPECTION_QUERY_WITH_HEADERS) {
      const endpointUrl = data.sandboxEndpointUrl || graphqlEndpoint;
      try {
        const res = await handleRequest(endpointUrl, {
          method: 'POST',
          headers: { ...(data.introspectionRequestHeaders || {}) },
          body: data.introspectionRequestBody,
          credentials: data.includeCookies ? 'include' : 'omit'
        });
        const json = await res.json();
        markSchemaReadyFromJson(json);
        if (json?.errors?.length) {
          postToEmbed({ name: MSG.SCHEMA_ERROR, errors: json.errors, operationId: data.operationId }, event.source, event.origin);
        } else {
          postToEmbed({ name: MSG.SCHEMA_RESPONSE, schema: json.data, operationId: data.operationId }, event.source, event.origin);
        }
      } catch (error) {
        postToEmbed({
          name: MSG.SCHEMA_ERROR,
          error: error instanceof Error ? error.message : String(error),
          operationId: data.operationId
        }, event.source, event.origin);
      }
      return;
    }

    if (data.name === MSG.EXPLORER_QUERY_MUTATION_REQUEST && data.operation && data.operationId && data.endpointUrl) {
      try {
        const res = await handleRequest(data.endpointUrl, {
          method: 'POST',
          headers: { ...(data.headers || {}) },
          body: JSON.stringify({
            query: data.operation,
            variables: data.variables || {},
            operationName: data.operationName
          }),
          credentials: data.includeCookies ? 'include' : 'omit'
        });
        const responseHeaders = {};
        res.headers.forEach((value, key) => { responseHeaders[key] = value; });
        const json = await res.json();
        markSchemaReadyFromJson(json);
        postToEmbed({
          name: MSG.EXPLORER_QUERY_MUTATION_RESPONSE,
          operationId: data.operationId,
          response: { ...json, status: res.status, headers: responseHeaders, hasNext: false }
        }, event.source, event.origin);
      } catch (error) {
        postToEmbed({
          name: MSG.EXPLORER_QUERY_MUTATION_RESPONSE,
          operationId: data.operationId,
          response: {
            data: null,
            error: { message: error instanceof Error ? error.message : String(error) },
            hasNext: false
          }
        }, event.source, event.origin);
      }
    }
  };`;
}
//# sourceMappingURL=sandbox-relay.js.map