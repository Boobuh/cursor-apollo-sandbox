import type { CapturedGraphqlAuth, HeaderDetectionResult } from "./sandbox.types";

const SKIP_REQUEST_HEADERS = new Set([
  "content-length",
  "content-type",
  "accept",
  "host",
  "connection",
  "accept-encoding",
  "accept-language",
  "origin",
  "referer",
  "user-agent",
  "sec-ch-ua",
  "sec-ch-ua-mobile",
  "sec-ch-ua-platform",
  "sec-fetch-dest",
  "sec-fetch-mode",
  "sec-fetch-site",
  "sec-fetch-storage-access",
  "priority"
]);

/** Custom headers commonly sent on authenticated /graphql POST requests. */
export const GRAPHQL_TRAFFIC_HEADER_NAMES = new Set([
  "authorization",
  "x-company-id",
  "x-role-assignment-id",
  "x-language-id",
  "x-cloned-session-id",
  "x-session-user-id"
]);

export function isAllowedGraphqlTrafficHeader(name: string): boolean {
  const lower = name.toLowerCase();
  if (GRAPHQL_TRAFFIC_HEADER_NAMES.has(lower)) return true;
  if (lower.startsWith("x-datadog-")) return false;
  if (lower.startsWith("sec-")) return false;
  return false;
}

export function filterGraphqlTrafficHeaders(
  headers: Record<string, string>
): Record<string, string> {
  const filtered: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!value || SKIP_REQUEST_HEADERS.has(key.toLowerCase())) continue;
    if (!isAllowedGraphqlTrafficHeader(key)) continue;
    filtered[key] = value;
  }
  return filtered;
}

export function parseGraphqlRequestBody(body: unknown): {
  query?: string;
  variables?: Record<string, unknown>;
  operationName?: string;
} {
  if (body == null) return {};
  let parsed: unknown = body;
  if (typeof body === "string") {
    try {
      parsed = JSON.parse(body);
    } catch {
      return {};
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }
  const record = parsed as Record<string, unknown>;
  const query = typeof record.query === "string" ? record.query : undefined;
  const operationName =
    typeof record.operationName === "string" ? record.operationName : undefined;
  let variables: Record<string, unknown> | undefined;
  if (
    record.variables &&
    typeof record.variables === "object" &&
    !Array.isArray(record.variables)
  ) {
    variables = record.variables as Record<string, unknown>;
  } else if (record.variables == null) {
    variables = {};
  }
  return { query, variables, operationName };
}

export function normalizeVariablesJson(
  variables: Record<string, unknown> | undefined
): string {
  try {
    return JSON.stringify(variables ?? {}, null, 2);
  } catch {
    return "{}";
  }
}

/** Probe / introspection-only documents — prefer real app operations when merging. */
export function isTrivialProbeQuery(query?: string): boolean {
  if (!query?.trim()) return true;
  const normalized = query.replace(/\s+/g, " ").trim();
  if (normalized.includes("ApolloSandboxProbe")) return true;
  if (/__schema\b|IntrospectionQuery|query\s+Introspection/i.test(normalized)) {
    return true;
  }
  return /^(\{\s*__typename\s*\}|query\s+\w*\s*\{\s*__typename\s*\})$/i.test(
    normalized
  );
}

export function hasRealGraphqlOperation(
  capture?: CapturedGraphqlAuth | HeaderDetectionResult | null
): boolean {
  return Boolean(
    capture?.operation?.trim() && !isTrivialProbeQuery(capture.operation)
  );
}

function pickRicherOperation(
  current: CapturedGraphqlAuth,
  part: CapturedGraphqlAuth | HeaderDetectionResult
): void {
  const query = part.operation?.trim();
  if (!query) return;
  const currentQuery = current.operation?.trim();
  const partIsProbe = isTrivialProbeQuery(query);
  const currentIsProbe = isTrivialProbeQuery(currentQuery);
  if (!currentQuery || (currentIsProbe && !partIsProbe)) {
    current.operation = query;
    current.variablesJson = formatPartVariablesJson(part);
  }
}

function formatPartVariablesJson(
  part: CapturedGraphqlAuth | HeaderDetectionResult
): string {
  const raw = part.variablesJson?.trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return JSON.stringify(parsed, null, 2);
      }
    } catch {
      return raw;
    }
  }
  return normalizeVariablesJson(undefined);
}

/** Browser script: capture headers only from live /graphql network requests. */
export function buildAutoDetectHeadersScript(
  graphqlUrl: string,
  urlMatch: string,
  listenMs: number
): string {
  const skipList = JSON.stringify([...SKIP_REQUEST_HEADERS]);
  const allowList = JSON.stringify([...GRAPHQL_TRAFFIC_HEADER_NAMES]);
  return `(async () => {
  const graphqlUrl = ${JSON.stringify(graphqlUrl)};
  const urlMatch = ${JSON.stringify(urlMatch)};
  const listenMs = ${listenMs};
  const skip = new Set(${skipList});
  const allow = new Set(${allowList});
  const sources = [];

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
    } else if (typeof input === 'object') {
      for (const [k, v] of Object.entries(input)) add(k, v);
    }
    return out;
  };

  const filterTrafficHeaders = (raw) => {
    const normalized = normalizeHeaders(raw);
    const out = {};
    for (const [k, v] of Object.entries(normalized)) {
      const lower = k.toLowerCase();
      if (!allow.has(lower)) continue;
      if (lower.startsWith('x-datadog-')) continue;
      out[k] = v;
    }
    return out;
  };

  const mergeHeaders = (...sets) => {
    const out = {};
    for (const set of sets) {
      if (!set) continue;
      for (const [k, v] of Object.entries(set)) {
        if (v != null && v !== '') out[k] = String(v);
      }
    }
    return out;
  };

  const matchesGraphql = (url) => {
    const u = String(url || '').toLowerCase();
    if (!u.includes('/graphql')) return false;
    if (urlMatch && urlMatch !== '/graphql') return u.includes(String(urlMatch).toLowerCase());
    return true;
  };

  let intercepted = {};
  let graphqlRequestCount = 0;
  let apolloLinkSeen = false;
  let capturedQuery = '';
  let capturedVariables = {};

  const isTrivialProbe = (query) => {
    if (!query || typeof query !== 'string') return true;
    const n = query.replace(/\\s+/g, ' ').trim();
    return /^(\\{\\s*__typename\\s*\\}|query\\s+\\w*\\s*\\{\\s*__typename\\s*\\})$/i.test(n)
      || n.includes('ApolloSandboxProbe');
  };

  const applyRequestBody = (query, variables) => {
    if (!query || typeof query !== 'string') return;
    const vars = variables && typeof variables === 'object' && !Array.isArray(variables)
      ? variables
      : {};
    const probe = isTrivialProbe(query);
    const currentProbe = isTrivialProbe(capturedQuery);
    if (!capturedQuery || (currentProbe && !probe)) {
      capturedQuery = query;
      capturedVariables = vars;
    }
  };

  const parseBodyString = (body) => {
    if (body == null) return;
    if (typeof body !== 'string') return;
    try {
      const parsed = JSON.parse(body);
      applyRequestBody(parsed.query, parsed.variables);
    } catch {}
  };

  const readApolloOperation = (operation) => {
    if (!operation) return;
    let query =
      operation.query?.loc?.source?.body ||
      (typeof operation.query === 'string' ? operation.query : '');
    if (!query && operation.extensions?.document) {
      query = String(operation.extensions.document);
    }
    applyRequestBody(query, operation.variables);
  };

  const persistLastRequest = () => {
    try {
      sessionStorage.setItem('__apolloLastGraphqlRequest', JSON.stringify({
        headers: intercepted,
        query: capturedQuery,
        variables: capturedVariables,
        ts: Date.now()
      }));
      sessionStorage.setItem('__apolloLastGraphqlHeaders', JSON.stringify({
        headers: intercepted,
        ts: Date.now()
      }));
    } catch {}
  };

  const saveTrafficCapture = (rawHeaders, bodyOrOperation, ok, viaLink) => {
    const headers = filterTrafficHeaders(rawHeaders);
    if (viaLink) readApolloOperation(bodyOrOperation);
    else parseBodyString(bodyOrOperation);
    if (!Object.keys(headers).length && !capturedQuery) return;
    if (Object.keys(headers).length) {
      graphqlRequestCount += 1;
      if (viaLink) apolloLinkSeen = true;
      if (ok) {
        intercepted = mergeHeaders(intercepted, headers);
      } else {
        intercepted = mergeHeaders(headers, intercepted);
      }
    }
    persistLastRequest();
  };

  try {
    const cached = JSON.parse(sessionStorage.getItem('__apolloLastGraphqlRequest') || 'null')
      || JSON.parse(sessionStorage.getItem('__apolloLastGraphqlHeaders') || 'null');
    if (cached?.headers && Date.now() - (cached.ts || 0) < 300000) {
      saveTrafficCapture(cached.headers, null, true, false);
      if (cached.query) applyRequestBody(cached.query, cached.variables);
      persistLastRequest();
    }
  } catch {}

  const findApolloClient = (rootEl) => {
    if (!rootEl) return null;
    const key = Object.keys(rootEl).find((k) =>
      k.startsWith('__reactFiber') || k.startsWith('__reactContainer')
    );
    if (!key) return null;
    const queue = [rootEl[key]];
    const seen = new Set();
    while (queue.length) {
      const fiber = queue.shift();
      if (!fiber || seen.has(fiber)) continue;
      seen.add(fiber);
      const client =
        fiber.memoizedProps?.client ||
        fiber.memoizedState?.client ||
        fiber.stateNode?.client;
      if (client && typeof client.query === 'function' && client.link) return client;
      if (fiber.child) queue.push(fiber.child);
      if (fiber.sibling) queue.push(fiber.sibling);
    }
    return null;
  };

  const wrapApolloClientLink = (client) => {
    const link = client?.link;
    if (!link?.request || link.__apolloSandboxTap) return false;
    const orig = link.request.bind(link);
    link.request = (operation, forward) => {
      saveTrafficCapture(operation?.getContext?.()?.headers || {}, operation, true, true);
      const tappedForward = (op) => {
        saveTrafficCapture(op?.getContext?.()?.headers || {}, op, true, true);
        return forward(op);
      };
      return orig(operation, tappedForward);
    };
    link.__apolloSandboxTap = true;
    return true;
  };

  const PROBE_DOC = {
    kind: 'Document',
    definitions: [{
      kind: 'OperationDefinition',
      operation: 'query',
      name: { kind: 'Name', value: 'ApolloSandboxProbe' },
      selectionSet: {
        kind: 'SelectionSet',
        selections: [{ kind: 'Field', name: { kind: 'Name', value: '__typename' } }]
      }
    }]
  };

  const provokeViaApollo = async (client) => {
    wrapApolloClientLink(client);
    try {
      if (typeof client.refetchQueries === 'function') {
        await client.refetchQueries({ include: 'active' });
        return true;
      }
      if (typeof client.reFetchObservableQueries === 'function') {
        await client.reFetchObservableQueries(true);
        return true;
      }
    } catch {}
    if (capturedQuery && !isTrivialProbe(capturedQuery)) return true;
    try {
      await client.query({
        query: PROBE_DOC,
        fetchPolicy: 'network-only',
        errorPolicy: 'ignore'
      });
      return true;
    } catch {
      return false;
    }
  };

  const hasRealQuery = () => capturedQuery && !isTrivialProbe(capturedQuery);

  const resolveFetchCall = (input, init) => {
    let url = typeof input === 'string' ? input : input?.url;
    let opts = init ? { ...init } : {};
    if (input instanceof Request) {
      url = input.url;
      opts = {
        method: input.method,
        headers: init?.headers ?? input.headers,
        body: init?.body ?? undefined,
        credentials: init?.credentials ?? input.credentials,
        ...opts
      };
    }
    return { url, opts, input };
  };

  const readFetchBody = async (input, opts) => {
    if (typeof opts?.body === 'string') return opts.body;
    if (input instanceof Request) {
      try {
        return await input.clone().text();
      } catch {}
    }
    return undefined;
  };

  const replayCachedGraphqlRequest = async () => {
    try {
      const cached = JSON.parse(
        sessionStorage.getItem('__apolloLastGraphqlRequest') || 'null'
      );
      if (!cached?.query || isTrivialProbe(cached.query)) return false;
      const headers = {
        'Content-Type': 'application/json',
        ...(cached.headers || {}),
        ...intercepted
      };
      await origFetch.call(window, graphqlUrl, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({
          query: cached.query,
          variables: cached.variables || {}
        })
      });
      applyRequestBody(cached.query, cached.variables);
      persistLastRequest();
      return true;
    } catch {
      return false;
    }
  };

  const origFetch = window.fetch;
  window.fetch = async function(...args) {
    const { url, opts, input } = resolveFetchCall(args[0], args[1]);
    const isGql = matchesGraphql(url);
    if (isGql) {
      const body = await readFetchBody(input, opts);
      saveTrafficCapture(opts?.headers || {}, body, true, false);
    }
    const res = await origFetch.apply(this, args);
    return res;
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
    const xhr = this;
    if (matchesGraphql(xhr.__url)) {
      saveTrafficCapture(xhr.__headers || {}, b, true, false);
      const prev = xhr.onreadystatechange;
      xhr.onreadystatechange = function() {
        if (xhr.readyState === 4) {
          saveTrafficCapture(xhr.__headers || {}, b, xhr.status >= 200 && xhr.status < 300, false);
        }
        if (prev) return prev.apply(this, arguments);
      };
    }
    return origSend.call(this, b);
  };

  const provokeRealGraphqlTraffic = async () => {
    await replayCachedGraphqlRequest();
    const roots = [
      document.getElementById('__next'),
      document.getElementById('root'),
      document.body
    ].filter(Boolean);
    for (const root of roots) {
      const client = findApolloClient(root);
      if (client && (await provokeViaApollo(client))) {
        if (hasRealQuery()) return;
      }
    }
    const nextRouter = window.next?.router;
    if (nextRouter?.refresh) {
      try {
        await nextRouter.refresh();
        return;
      } catch {}
    }
    if (nextRouter?.replace && nextRouter?.asPath) {
      try {
        await nextRouter.replace(nextRouter.asPath);
        return;
      } catch {}
    }
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
  };

  await provokeRealGraphqlTraffic();

  const deadline = Date.now() + listenMs;
  let lastProvoke = 0;
  while (Date.now() < deadline) {
    if (hasRealQuery() && Object.keys(intercepted).length > 0) {
      await new Promise((r) => setTimeout(r, 500));
      if (hasRealQuery()) break;
    }
    if (Date.now() - lastProvoke > 1400) {
      await provokeRealGraphqlTraffic();
      lastProvoke = Date.now();
    }
    await new Promise((r) => setTimeout(r, 350));
  }

  if (!Object.keys(intercepted).length) {
    const payload = {
      headers: {},
      graphqlSeen: false,
      probeOk: false,
      sources: ['no-graphql-traffic']
    };
    sessionStorage.setItem('__apolloAuth', JSON.stringify(payload));
    return payload;
  }

  sources.push(apolloLinkSeen ? 'apollo-link' : 'traffic');

  const probeQuery = '{ __typename }';
  const probeBody = JSON.stringify({ query: probeQuery });
  let probeOk = false;
  try {
    const res = await origFetch.call(window, graphqlUrl, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...intercepted },
      body: probeBody
    });
    let json = null;
    try { json = await res.clone().json(); } catch {}
    probeOk = Boolean(
      res.ok && json && (!json.errors || json.data?.__typename)
    );
    if (probeOk) sources.push('probe:traffic');
  } catch {}

  const payload = {
    headers: intercepted,
    operation: hasRealQuery() ? capturedQuery : undefined,
    variablesJson: hasRealQuery()
      ? JSON.stringify(capturedVariables ?? {}, null, 2)
      : undefined,
    graphqlSeen: true,
    probeOk,
    sources: [...new Set(sources)]
  };
  sessionStorage.setItem('__apolloAuth', JSON.stringify(payload));
  return payload;
})()`;
}

export function buildPersistHeadersScript(
  capture: CapturedGraphqlAuth,
  meta?: Partial<HeaderDetectionResult>
): string {
  const payload = JSON.stringify({
    headers: capture.headers,
    operation: capture.operation,
    variablesJson: capture.variablesJson,
    graphqlSeen: true,
    probeOk: meta?.probeOk ?? capture.probeOk,
    sources: meta?.sources ?? capture.sources ?? ["cross-tab"]
  });
  return `sessionStorage.setItem('__apolloAuth', ${JSON.stringify(payload)}); true;`;
}

export function mergeDetectedHeaders(
  ...parts: Array<CapturedGraphqlAuth | HeaderDetectionResult | null | undefined>
): CapturedGraphqlAuth {
  const headers: Record<string, string> = {};
  const sources = new Set<string>();
  let graphqlSeen = false;
  let probeOk = false;

  for (const part of parts) {
    if (!part) continue;
    Object.assign(headers, part.headers);
    if (part.graphqlSeen) graphqlSeen = true;
    if ("probeOk" in part && part.probeOk) probeOk = true;
    if ("sources" in part && part.sources) {
      for (const s of part.sources) sources.add(s);
    }
  }

  const result: CapturedGraphqlAuth = {
    headers,
    graphqlSeen: graphqlSeen || probeOk,
    probeOk,
    sources: [...sources]
  };

  for (const part of parts) {
    if (!part) continue;
    pickRicherOperation(result, part);
  }

  return result;
}

export function mergeTrafficHeadersOnly(
  ...parts: Array<CapturedGraphqlAuth | HeaderDetectionResult | null | undefined>
): CapturedGraphqlAuth {
  const trafficParts = parts.filter(
    (part) =>
      part &&
      part.sources?.some((source) => source === "traffic" || source === "apollo-link") &&
      Object.keys(part.headers ?? {}).length > 0
  );
  return mergeDetectedHeaders(...trafficParts);
}

/** Merge traffic headers plus operation/variables from traffic or session cache. */
export function mergeTrafficCapture(
  ...parts: Array<CapturedGraphqlAuth | HeaderDetectionResult | null | undefined>
): CapturedGraphqlAuth {
  const merged = mergeTrafficHeadersOnly(...parts);
  for (const part of parts) {
    if (!part) continue;
    const fromCapture =
      part.sources?.some(isTrafficHeaderSource) ||
      part.sources?.includes("session-cache");
    if (fromCapture) {
      pickRicherOperation(merged, part);
    }
  }
  return merged;
}

export function isTrafficHeaderSource(source: string): boolean {
  return source === "traffic" || source === "apollo-link";
}

export function isOperationCaptureSource(source: string): boolean {
  return isTrafficHeaderSource(source) || source === "session-cache";
}

/** Read last captured graphql POST from sessionStorage (same-origin tabs). */
export function buildReadCachedGraphqlRequestScript(): string {
  return `(() => {
  const isTrivialProbe = (query) => {
    if (!query || typeof query !== 'string') return true;
    const n = query.replace(/\\s+/g, ' ').trim();
    if (n.includes('ApolloSandboxProbe')) return true;
    if (/__schema\\b|IntrospectionQuery|query\\s+Introspection/i.test(n)) return true;
    return /^(\\{\\s*__typename\\s*\\}|query\\s+\\w*\\s*\\{\\s*__typename\\s*\\})$/i.test(n);
  };
  try {
    const raw =
      sessionStorage.getItem('__apolloLastGraphqlRequest') ||
      sessionStorage.getItem('__apolloAuth');
    if (!raw) return null;
    const cached = JSON.parse(raw);
    const headers = cached.headers || {};
    const queryRaw = cached.query || cached.operation;
    const query =
      typeof queryRaw === 'string' && !isTrivialProbe(queryRaw)
        ? queryRaw
        : undefined;
    const variables =
      cached.variables && typeof cached.variables === 'object' ? cached.variables : {};
    const formatVars = (value) => {
      try {
        return JSON.stringify(value && typeof value === 'object' ? value : {}, null, 2);
      } catch {
        return '{}';
      }
    };
    const resolveVariablesJson = () => {
      if (typeof cached.variablesJson === 'string' && cached.variablesJson.trim()) {
        try {
          const parsed = JSON.parse(cached.variablesJson);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return JSON.stringify(parsed, null, 2);
          }
        } catch {
          return cached.variablesJson.trim();
        }
      }
      return formatVars(variables);
    };
    if (!query && !Object.keys(headers).length) return null;
    return {
      headers,
      operation: query,
      variablesJson: query ? resolveVariablesJson() : undefined,
      graphqlSeen: Boolean(query || Object.keys(headers).length),
      probeOk: false,
      sources: ['session-cache']
    };
  } catch {
    return null;
  }
})();`;
}

/** Install long-lived fetch/xhr hooks on app pages (survives until reload). */
export function buildInstallPersistentTrafficHookScript(): string {
  const allowList = JSON.stringify([...GRAPHQL_TRAFFIC_HEADER_NAMES]);
  return `(function installApolloSandboxTrafficHook() {
  if (window.__apolloSandboxTrafficHook) return true;
  window.__apolloSandboxTrafficHook = true;
  const allow = new Set(${allowList});
  const matchesGraphql = (url) => String(url || '').toLowerCase().includes('/graphql');
  const isTrivialProbe = (query) => {
    if (!query || typeof query !== 'string') return true;
    const n = query.replace(/\\s+/g, ' ').trim();
    return /^(\\{\\s*__typename\\s*\\}|query\\s+\\w*\\s*\\{\\s*__typename\\s*\\})$/i.test(n);
  };
  const persist = (raw, body) => {
    const headers = {};
    const add = (k, v) => {
      if (v == null || v === '') return;
      const lower = String(k).toLowerCase();
      if (!allow.has(lower) || lower.startsWith('x-datadog-')) return;
      headers[k] = String(v);
    };
    if (raw && typeof raw.forEach === 'function') raw.forEach((v, k) => add(k, v));
    else if (raw && typeof raw === 'object') {
      for (const [k, v] of Object.entries(raw)) add(k, v);
    }
    let query = '';
    let variables = {};
    if (typeof body === 'string') {
      try {
        const parsed = JSON.parse(body);
        if (typeof parsed.query === 'string') query = parsed.query;
        if (parsed.variables && typeof parsed.variables === 'object' && !Array.isArray(parsed.variables)) {
          variables = parsed.variables;
        }
      } catch {}
    }
    if (!Object.keys(headers).length && !query) return;
    let cached = null;
    try {
      cached = JSON.parse(sessionStorage.getItem('__apolloLastGraphqlRequest') || 'null');
    } catch {}
    const keepQuery = cached?.query && !isTrivialProbe(cached.query) && isTrivialProbe(query)
      ? cached.query
      : (query || cached?.query || '');
    const keepVars = keepQuery === cached?.query ? (cached?.variables || {}) : variables;
    sessionStorage.setItem('__apolloLastGraphqlRequest', JSON.stringify({
      headers: Object.keys(headers).length ? headers : (cached?.headers || {}),
      query: keepQuery,
      variables: keepVars,
      ts: Date.now()
    }));
    if (Object.keys(headers).length) {
      sessionStorage.setItem('__apolloLastGraphqlHeaders', JSON.stringify({
        headers: Object.keys(headers).length ? headers : (cached?.headers || {}),
        ts: Date.now()
      }));
    }
  };
  const origFetch = window.fetch;
  window.fetch = async function(...args) {
    const input = args[0];
    const init = args[1] || {};
    const url = typeof input === 'string' ? input : input?.url;
    if (matchesGraphql(url)) {
      const hdrs = init.headers || (input instanceof Request ? input.headers : undefined);
      let body = init.body;
      if (typeof body !== 'string' && input instanceof Request) {
        try { body = await input.clone().text(); } catch {}
      }
      persist(hdrs, body);
    }
    return origFetch.apply(this, args);
  };
  const origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
  const origSend = XMLHttpRequest.prototype.send;
  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(m, url, ...rest) {
    this.__apolloUrl = url;
    return origOpen.call(this, m, url, ...rest);
  };
  XMLHttpRequest.prototype.setRequestHeader = function(k, v) {
    this.__apolloHeaders = this.__apolloHeaders || {};
    this.__apolloHeaders[k] = v;
    return origSetHeader.call(this, k, v);
  };
  XMLHttpRequest.prototype.send = function(body) {
    if (matchesGraphql(this.__apolloUrl)) persist(this.__apolloHeaders || {}, body);
    return origSend.call(this, body);
  };
  return true;
})();`;
}

export function hasRequiredGraphqlAuthHeaders(headers: Record<string, string>): boolean {
  const lower = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
  );
  return Boolean(
    lower.authorization &&
      lower["x-company-id"] &&
      lower["x-role-assignment-id"] &&
      lower["x-language-id"]
  );
}
