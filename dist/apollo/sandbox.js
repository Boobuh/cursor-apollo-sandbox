"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FALLBACK_VARIABLES_JSON = exports.FALLBACK_OPERATION = void 0;
exports.deriveGraphqlUrlMatch = deriveGraphqlUrlMatch;
exports.parseVariablesJson = parseVariablesJson;
exports.buildSandboxIframeUrl = buildSandboxIframeUrl;
exports.buildFillSandboxScript = buildFillSandboxScript;
exports.buildRunOperationScript = buildRunOperationScript;
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
        document: operation,
        variables: variablesJson,
        headers: JSON.stringify(auth.headers, null, 2)
    });
    return `https://sandbox.embed.apollographql.com/sandbox/explorer?${params.toString()}`;
}
function buildFillSandboxScript(iframeUrl, waitMs) {
    return `(async () => {
  const iframeUrl = ${JSON.stringify(iframeUrl)};
  const waitMs = ${waitMs};
  const stored = JSON.parse(sessionStorage.getItem('__apolloAuth') || '{"headers":{}}');
  const headerObj = stored?.headers || {};

  const endpoint = location.href;
  const container = document.querySelector('#embeddableSandbox');
  if (!container) {
    return { err: 'Not on an Apollo Server Sandbox page (#embeddableSandbox missing). Open apolloSandbox.graphqlUrl first.' };
  }

  container.innerHTML = '';
  const iframe = document.createElement('iframe');
  iframe.src = iframeUrl;
  iframe.id = 'apollo-embed-0';
  iframe.style.cssText = 'background-color:white;height:100%;width:100%;border:none;';
  container.appendChild(iframe);

  if (window.__sandboxRelayCleanup) try { window.__sandboxRelayCleanup(); } catch {}

  const handleRequest = async (url, options) =>
    fetch(url || endpoint, {
      ...(options || {}),
      headers: { ...(options?.headers || {}), ...headerObj },
      credentials: 'include'
    });

  const onMsg = async (event) => {
    if (!event.origin.includes('apollographql.com')) return;
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    const t = String(data.name || data.type || '');
    if (!t.includes('QueryMutationRequest') && !t.includes('IntrospectionQuery')) return;
    const p = data.payload || data;
    try {
      const url = p.sandboxEndpointUrl || p.endpointUrl || endpoint;
      let res;
      if (p.introspectionRequestBody) {
        res = await handleRequest(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...headerObj,
            ...(p.introspectionRequestHeaders || {})
          },
          body: p.introspectionRequestBody
        });
      } else {
        const body = p.body || JSON.stringify({ query: p.operation, variables: p.variables || {} });
        res = await handleRequest(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...headerObj,
            ...(p.headers || {})
          },
          body
        });
      }
      const text = await res.text();
      event.source.postMessage({
        name: data.name?.replace('Request', 'Response'),
        type: 'explorerQueryMutationResponse',
        payload: { operationId: p.operationId, response: { body: text, status: res.status } }
      }, event.origin);
    } catch {}
  };

  window.__sandboxRelayCleanup = () => window.removeEventListener('message', onMsg);
  window.addEventListener('message', onMsg);
  await new Promise(r => setTimeout(r, waitMs));
  return { ok: true, headerKeys: Object.keys(headerObj) };
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