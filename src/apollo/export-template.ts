/** Pretty-formatted default GraphQL operation for Apollo Sandbox URL fill. */
export const DEFAULT_OPERATION = `query ExampleQuery($id: ID) {
  __typename
}`;

export const DEFAULT_VARIABLES = {
  id: null
} as const;

export const DEFAULT_VARIABLES_JSON = JSON.stringify(DEFAULT_VARIABLES, null, 2);

export interface ApolloAuth {
  authorization: string;
  "x-company-id"?: string;
  "x-role-assignment-id"?: string;
  "x-language-id"?: string;
}

export function buildSandboxIframeUrl(
  graphqlEndpoint: string,
  auth: ApolloAuth,
  operation = DEFAULT_OPERATION,
  variablesJson = DEFAULT_VARIABLES_JSON
): string {
  const headerObj: Record<string, string> = {
    Authorization: auth.authorization,
    "x-company-id": auth["x-company-id"] ?? "",
    "x-role-assignment-id": auth["x-role-assignment-id"] ?? "",
    "x-language-id": auth["x-language-id"] ?? ""
  };

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
    headers: JSON.stringify(headerObj, null, 2)
  });

  return `https://sandbox.embed.apollographql.com/sandbox/explorer?${params.toString()}`;
}

export function buildCaptureAuthScript(): string {
  return `(async () => {
  window.__capturedAuth = null;
  const save = (h) => {
    const auth = h.authorization || h.Authorization;
    if (!auth || !auth.startsWith('Bearer ')) return;
    window.__capturedAuth = {
      authorization: auth,
      'x-company-id': h['x-company-id'] || h['X-Company-Id'],
      'x-role-assignment-id': h['x-role-assignment-id'] || h['X-Role-Assignment-Id'],
      'x-language-id': h['x-language-id'] || h['X-Language-Id']
    };
    sessionStorage.setItem('__apolloAuth', JSON.stringify(window.__capturedAuth));
  };
  const origFetch = window.fetch;
  window.fetch = async function(...args) {
    const [url, opts] = args;
    const u = typeof url === 'string' ? url : url?.url;
    if (u && u.includes('/graphql')) save(opts?.headers || {});
    return origFetch.apply(this, args);
  };
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  const origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open = function(m, url, ...r) { this.__url = url; return origOpen.call(this,m,url,...r); };
  XMLHttpRequest.prototype.setRequestHeader = function(k,v) { this.__headers = this.__headers||{}; this.__headers[k.toLowerCase()] = v; return origSetHeader.call(this,k,v); };
  XMLHttpRequest.prototype.send = function(b) {
    if ((this.__url||'').includes('graphql')) save(this.__headers||{});
    return origSend.call(this,b);
  };
  for (let i = 0; i < 30 && !window.__capturedAuth; i++) await new Promise(r => setTimeout(r, 500));
  return window.__capturedAuth || JSON.parse(sessionStorage.getItem('__apolloAuth')||'null');
})()`;
}

export function buildFillSandboxScript(iframeUrl: string, waitMs: number): string {
  return `(async () => {
  const iframeUrl = ${JSON.stringify(iframeUrl)};
  const waitMs = ${waitMs};
  const auth = JSON.parse(sessionStorage.getItem('__apolloAuth')||'null');
  if (!auth?.authorization) return { err: 'No auth — run Capture Auth first (logged into your app in this browser tab).' };
  const headerObj = {
    Authorization: auth.authorization,
    'x-company-id': auth['x-company-id'],
    'x-role-assignment-id': auth['x-role-assignment-id'],
    'x-language-id': auth['x-language-id']
  };
  const endpoint = location.href;
  const container = document.querySelector('#embeddableSandbox');
  if (!container) return { err: 'Not on Apollo Server page (#embeddableSandbox missing)' };
  container.innerHTML = '';
  const iframe = document.createElement('iframe');
  iframe.src = iframeUrl;
  iframe.id = 'apollo-embed-0';
  iframe.style.cssText = 'background-color:white;height:100%;width:100%;border:none;';
  container.appendChild(iframe);
  if (window.__sandboxRelayCleanup) try { window.__sandboxRelayCleanup(); } catch {}
  const handleRequest = async (url, options) => fetch(url || endpoint, { ...(options||{}), headers: { ...(options?.headers||{}), ...headerObj }, credentials: 'include' });
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
        res = await handleRequest(url, { method:'POST', headers: { 'Content-Type':'application/json', ...headerObj, ...(p.introspectionRequestHeaders||{}) }, body: p.introspectionRequestBody });
      } else {
        const body = p.body || JSON.stringify({ query: p.operation, variables: p.variables||{} });
        res = await handleRequest(url, { method:'POST', headers: { 'Content-Type':'application/json', ...headerObj, ...(p.headers||{}) }, body });
      }
      const text = await res.text();
      event.source.postMessage({ name: data.name?.replace('Request','Response'), type: 'explorerQueryMutationResponse', payload: { operationId: p.operationId, response: { body: text, status: res.status } } }, event.origin);
    } catch {}
  };
  window.__sandboxRelayCleanup = () => window.removeEventListener('message', onMsg);
  window.addEventListener('message', onMsg);
  await new Promise(r => setTimeout(r, waitMs));
  return { ok: true, headers: Object.keys(headerObj) };
})()`;
}

export function buildRunOperationScript(): string {
  const operationOneLine = DEFAULT_OPERATION.replace(/\s+/g, " ").trim();
  return `(async () => {
  const auth = JSON.parse(sessionStorage.getItem('__apolloAuth')||'null');
  if (!auth?.authorization) return { err: 'no auth' };
  const query = ${JSON.stringify(operationOneLine)};
  const variables = ${JSON.stringify(DEFAULT_VARIABLES)};
  const headers = { 'Content-Type':'application/json', authorization: auth.authorization, 'x-company-id': auth['x-company-id'], 'x-role-assignment-id': auth['x-role-assignment-id'], 'x-language-id': auth['x-language-id'] };
  const t0 = Date.now();
  const res = await fetch('/graphql', { method:'POST', credentials:'include', headers, body: JSON.stringify({ query, variables }) });
  const json = await res.json();
  return { status: res.status, ms: Date.now()-t0, data: json?.data, errors: json?.errors?.map(e=>e.message) };
})()`;
}
