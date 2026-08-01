"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FALLBACK_VARIABLES_JSON = exports.FALLBACK_OPERATION = exports.resolveSandboxRelayReply = exports.handleSandboxRelayMessage = exports.isSchemaReadyGraphqlJson = exports.getHeadersWithContentTypeOnly = exports.getHeadersWithContentType = exports.computePostFillSettleMs = exports.APOLLO_SANDBOX_EMBED_ORIGIN = exports.ApolloSandboxMessage = void 0;
exports.deriveGraphqlUrlMatch = deriveGraphqlUrlMatch;
exports.parseVariablesJson = parseVariablesJson;
exports.formatVariablesJson = formatVariablesJson;
exports.buildSandboxIframeUrl = buildSandboxIframeUrl;
exports.buildFillSandboxScript = buildFillSandboxScript;
exports.buildRunOperationScript = buildRunOperationScript;
const sandbox_relay_1 = require("./sandbox-relay");
var sandbox_relay_2 = require("./sandbox-relay");
Object.defineProperty(exports, "ApolloSandboxMessage", { enumerable: true, get: function () { return sandbox_relay_2.ApolloSandboxMessage; } });
Object.defineProperty(exports, "APOLLO_SANDBOX_EMBED_ORIGIN", { enumerable: true, get: function () { return sandbox_relay_2.APOLLO_SANDBOX_EMBED_ORIGIN; } });
Object.defineProperty(exports, "computePostFillSettleMs", { enumerable: true, get: function () { return sandbox_relay_2.computePostFillSettleMs; } });
Object.defineProperty(exports, "getHeadersWithContentType", { enumerable: true, get: function () { return sandbox_relay_2.getHeadersWithContentType; } });
Object.defineProperty(exports, "getHeadersWithContentTypeOnly", { enumerable: true, get: function () { return sandbox_relay_2.getHeadersWithContentTypeOnly; } });
Object.defineProperty(exports, "isSchemaReadyGraphqlJson", { enumerable: true, get: function () { return sandbox_relay_2.isSchemaReadyGraphqlJson; } });
Object.defineProperty(exports, "handleSandboxRelayMessage", { enumerable: true, get: function () { return sandbox_relay_2.handleSandboxRelayMessage; } });
Object.defineProperty(exports, "resolveSandboxRelayReply", { enumerable: true, get: function () { return sandbox_relay_2.resolveSandboxRelayReply; } });
exports.FALLBACK_OPERATION = `query ExampleQuery {
  __typename
}`;
exports.FALLBACK_VARIABLES_JSON = "{}";
function deriveGraphqlUrlMatch(graphqlUrl) {
    try {
        const pathname = new URL(graphqlUrl).pathname;
        return pathname && pathname !== "/" ? pathname : "/graphql";
    }
    catch {
        return "/graphql";
    }
}
function parseVariablesJson(raw) {
    const trimmed = raw.trim() || "{}";
    try {
        const parsed = JSON.parse(trimmed);
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
            throw new Error("Variables must be a JSON object");
        }
        return parsed;
    }
    catch (err) {
        throw new Error(`apolloSandbox.defaultVariables must be valid JSON: ${err instanceof Error ? err.message : String(err)}`);
    }
}
/** Pretty-print variables JSON for the Sandbox Variables panel (2-space indent). */
function formatVariablesJson(raw) {
    const trimmed = raw.trim() || "{}";
    try {
        const parsed = JSON.parse(trimmed);
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
            return trimmed;
        }
        return JSON.stringify(parsed, null, 2);
    }
    catch {
        return trimmed;
    }
}
function buildSandboxIframeUrl(graphqlEndpoint, auth, operation, variablesJson) {
    const params = new URLSearchParams({
        runtime: "@apollo/server@5.4.0",
        endpoint: graphqlEndpoint,
        sendOperationHeadersInIntrospection: "true",
        hideCookieToggle: "false",
        parentSupportsSubscriptions: "true",
        version: "2.7.4",
        runTelemetry: "true",
        endpointIsEditable: "false",
        persistExplorerState: "false",
        document: operation,
        variables: formatVariablesJson(variablesJson),
        headers: JSON.stringify(auth.headers, null, 2)
    });
    return `https://sandbox.embed.apollographql.com/sandbox/explorer?${params.toString()}`;
}
function buildFillSandboxScript(graphqlEndpoint, operation, variablesJson, waitMs) {
    const postFillSettleMs = (0, sandbox_relay_1.computePostFillSettleMs)(waitMs);
    const relayFragment = (0, sandbox_relay_1.buildSandboxRelayBrowserFragment)();
    return `(async () => {
  const graphqlEndpoint = ${JSON.stringify(graphqlEndpoint)};
  const fallbackOperation = ${JSON.stringify(operation)};
  const fallbackVariablesJson = ${JSON.stringify(formatVariablesJson(variablesJson))};
  const initWaitMs = ${waitMs};
  const postFillSettleMs = ${postFillSettleMs};
  const formatVariablesJson = (raw) => {
    try {
      const parsed = JSON.parse(String(raw || '{}'));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return String(raw || '{}');
      }
      return JSON.stringify(parsed, null, 2);
    } catch {
      return String(raw || '{}');
    }
  };
  const stored = JSON.parse(sessionStorage.getItem('__apolloAuth') || '{"headers":{}}');
  const headerObj = stored?.headers || {};
  const isTrivialProbe = (query) => {
    if (!query || typeof query !== 'string') return true;
    const n = query.replace(/\\s+/g, ' ').trim();
    if (n.includes('ApolloSandboxProbe')) return true;
    if (/__schema\\b|IntrospectionQuery|query\\s+Introspection/i.test(n)) return true;
    return /^(\\{\\s*__typename\\s*\\}|query\\s+\\w*\\s*\\{\\s*__typename\\s*\\})$/i.test(n);
  };
  const storedOp = (stored?.operation || '').trim();
  const operationText = (storedOp && !isTrivialProbe(storedOp) ? storedOp : fallbackOperation).trim();
  const variablesText = formatVariablesJson(
    storedOp && !isTrivialProbe(storedOp)
      ? (stored?.variablesJson || fallbackVariablesJson || '{}')
      : (fallbackVariablesJson || '{}')
  );

  const baseParams = () => ({
    runtime: '@apollo/server@5.4.0',
    endpoint: graphqlEndpoint,
    sendOperationHeadersInIntrospection: 'true',
    hideCookieToggle: 'false',
    parentSupportsSubscriptions: 'true',
    version: '2.7.4',
    runTelemetry: 'true',
    endpointIsEditable: 'false',
    persistExplorerState: 'false',
    headers: JSON.stringify(headerObj, null, 2)
  });

  const buildBootstrapUrl = () => {
    const params = new URLSearchParams({
      ...baseParams(),
      _cb: 'bootstrap-' + String(Date.now())
    });
    return EMBED_ORIGIN + '/sandbox/explorer?' + params.toString();
  };

  const buildFilledUrl = () => {
    const params = new URLSearchParams({
      ...baseParams(),
      document: operationText,
      variables: variablesText,
      _cb: 'filled-' + String(Date.now())
    });
    return EMBED_ORIGIN + '/sandbox/explorer?' + params.toString();
  };

  const container = document.querySelector('#embeddableSandbox');
  if (!container) {
    return { err: 'Not on an Apollo Server Sandbox page (#embeddableSandbox missing). Open apolloSandbox.graphqlUrl first.' };
  }

  ${relayFragment}

  if (window.__sandboxRelayCleanup) try { window.__sandboxRelayCleanup(); } catch {}
  window.__sandboxRelayCleanup = () => window.removeEventListener('message', onMsg);
  window.addEventListener('message', onMsg);

  const probeEndpoint = async () => {
    try {
      const res = await fetch(graphqlEndpoint, {
        method: 'POST',
        credentials: 'include',
        headers: getHeadersWithContentType(headerObj),
        body: JSON.stringify({ query: '{ __typename }' })
      });
      const json = await res.json();
      markSchemaReadyFromJson(json);
    } catch {}
  };

  container.innerHTML = '';
  const iframe = document.createElement('iframe');
  iframe.id = 'apollo-embed-0';
  iframe.style.cssText = 'background-color:white;height:100%;width:100%;border:none;';
  container.appendChild(iframe);
  iframe.src = buildBootstrapUrl();

  const waitForSchemaReady = async (timeoutMs) => {
    const deadline = Date.now() + timeoutMs;
    while (!schemaReady && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 200));
    }
    return schemaReady;
  };

  void probeEndpoint();
  const ready = await waitForSchemaReady(initWaitMs);

  iframe.src = buildFilledUrl();
  await new Promise((r) => setTimeout(r, postFillSettleMs));

  return {
    ok: true,
    schemaReady: ready,
    headerKeys: Object.keys(headerObj),
    operationFilled: Boolean(operationText),
    variablesFilled: variablesText.trim() !== '{}'
  };
})()`;
}
function buildRunOperationScript(graphqlUrl, operation, variablesJson) {
    const operationOneLine = operation.replace(/\s+/g, " ").trim();
    const variables = parseVariablesJson(variablesJson);
    return `(async () => {
  const stored = JSON.parse(sessionStorage.getItem('__apolloAuth') || '{"headers":{}}');
  const captured = stored?.headers || {};
  const query = ${JSON.stringify(operationOneLine)};
  const variables = ${JSON.stringify(variables)};
  const headers = {
    'Content-Type': 'application/json',
    ...captured
  };
  const t0 = Date.now();
  const res = await fetch(${JSON.stringify(graphqlUrl)}, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify({ query, variables })
  });
  const json = await res.json();
  return {
    status: res.status,
    ms: Date.now() - t0,
    data: json?.data,
    errors: json?.errors?.map(e => e.message)
  };
  })()`;
}
//# sourceMappingURL=sandbox.js.map