import type { CapturedGraphqlAuth } from "./sandbox.types";

export const FALLBACK_OPERATION = `query ExampleQuery {
  __typename
}`;

export const FALLBACK_VARIABLES_JSON = "{}";

const SKIP_REQUEST_HEADERS = new Set([
  "content-length",
  "content-type",
  "accept",
  "host",
  "connection",
  "accept-encoding"
]);

export function deriveGraphqlUrlMatch(graphqlUrl: string): string {
  try {
    const pathname = new URL(graphqlUrl).pathname;
    return pathname && pathname !== "/" ? pathname : "/graphql";
  } catch {
    return "/graphql";
  }
}

export function parseVariablesJson(raw: string): Record<string, unknown> {
  const trimmed = raw.trim() || "{}";
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Variables must be a JSON object");
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    throw new Error(
      `apolloSandbox.defaultVariables must be valid JSON: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

export function buildSandboxIframeUrl(
  graphqlEndpoint: string,
  auth: CapturedGraphqlAuth,
  operation: string,
  variablesJson: string
): string {
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

export function buildCaptureAuthScript(urlMatch: string, waitMs: number): string {
  const skipList = JSON.stringify([...SKIP_REQUEST_HEADERS]);
  return `(async () => {
  const urlMatch = ${JSON.stringify(urlMatch)};
  const waitMs = ${waitMs};
  const skip = new Set(${skipList});
  window.__capturedAuth = null;
  window.__graphqlSeen = false;

  const normalizeHeaders = (input) => {
    const out = {};
    if (!input) return out;
    const add = (k, v) => {
      if (v == null || v === '') return;
      const key = String(k);
      if (skip.has(key.toLowerCase())) return;
      out[key] = String(v);
    };
    if (typeof input.forEach === 'function') input.forEach((v, k) => add(k, v));
    else if (Array.isArray(input)) {
      for (let i = 0; i < input.length; i += 2) add(input[i], input[i + 1]);
    } else {
      for (const [k, v] of Object.entries(input)) add(k, v);
    }
    return out;
  };

  const matchesGraphql = (url) => {
    const u = String(url || '');
    return u.includes('graphql') || (urlMatch && u.includes(urlMatch));
  };

  const save = (rawHeaders) => {
    const headers = normalizeHeaders(rawHeaders);
    window.__graphqlSeen = true;
    const prev = window.__capturedAuth?.headers || {};
    window.__capturedAuth = {
      headers: { ...prev, ...headers },
      graphqlSeen: true
    };
    sessionStorage.setItem('__apolloAuth', JSON.stringify(window.__capturedAuth));
  };

  const origFetch = window.fetch;
  window.fetch = async function(...args) {
    const [url, opts] = args;
    const u = typeof url === 'string' ? url : url?.url;
    if (matchesGraphql(u)) save(opts?.headers || {});
    return origFetch.apply(this, args);
  };

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  const origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open = function(m, url, ...r) {
    this.__url = url;
    return origOpen.call(this, m, url, ...r);
  };
  XMLHttpRequest.prototype.setRequestHeader = function(k, v) {
    this.__headers = this.__headers || {};
    this.__headers[k] = v;
    return origSetHeader.call(this, k, v);
  };
  XMLHttpRequest.prototype.send = function(b) {
    if (matchesGraphql(this.__url)) save(this.__headers || {});
    return origSend.call(this, b);
  };

  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline && !window.__graphqlSeen) {
    await new Promise(r => setTimeout(r, 500));
  }

  return window.__capturedAuth || JSON.parse(sessionStorage.getItem('__apolloAuth') || 'null');
})()`;
}

export function buildFillSandboxScript(iframeUrl: string, waitMs: number): string {
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

export function buildRunOperationScript(
  graphqlUrl: string,
  operation: string,
  variablesJson: string
): string {
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

export type { CapturedGraphqlAuth };
