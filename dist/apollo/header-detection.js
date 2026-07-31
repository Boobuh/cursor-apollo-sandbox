"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildAutoDetectHeadersScript = buildAutoDetectHeadersScript;
exports.buildPersistHeadersScript = buildPersistHeadersScript;
exports.mergeDetectedHeaders = mergeDetectedHeaders;
const SKIP_REQUEST_HEADERS = new Set([
    "content-length",
    "content-type",
    "accept",
    "host",
    "connection",
    "accept-encoding"
]);
/** Browser script: discover headers needed to execute GraphQL on this origin. */
function buildAutoDetectHeadersScript(graphqlUrl, urlMatch, listenMs) {
    const skipList = JSON.stringify([...SKIP_REQUEST_HEADERS]);
    return `(async () => {
  const graphqlUrl = ${JSON.stringify(graphqlUrl)};
  const urlMatch = ${JSON.stringify(urlMatch)};
  const listenMs = ${listenMs};
  const skip = new Set(${skipList});
  const sources = [];
  const candidates = [];

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
    const u = String(url || '');
    return u.includes('graphql') || (urlMatch && u.includes(urlMatch));
  };

  let intercepted = {};
  let graphqlSeen = false;

  const saveIntercept = (rawHeaders, ok) => {
    const headers = normalizeHeaders(rawHeaders);
    if (!Object.keys(headers).length) return;
    graphqlSeen = true;
    if (ok) {
      intercepted = mergeHeaders(intercepted, headers);
    } else {
      intercepted = mergeHeaders(headers, intercepted);
    }
  };

  const origFetch = window.fetch;
  window.fetch = async function(...args) {
    const [url, opts] = args;
    const u = typeof url === 'string' ? url : url?.url;
    const isGql = matchesGraphql(u);
    const res = await origFetch.apply(this, args);
    if (isGql) saveIntercept(opts?.headers || {}, res.ok);
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
      const prev = xhr.onreadystatechange;
      xhr.onreadystatechange = function() {
        if (xhr.readyState === 4) saveIntercept(xhr.__headers || {}, xhr.status >= 200 && xhr.status < 300);
        if (prev) return prev.apply(this, arguments);
      };
    }
    return origSend.call(this, b);
  };

  const bearerFrom = (value) => {
    if (!value || typeof value !== 'string') return null;
    const t = value.trim();
    if (t.length < 12) return null;
    return t.startsWith('Bearer ') ? t : 'Bearer ' + t;
  };

  const scanStorage = (store) => {
    const out = {};
    const headerAliases = [
      [/company/i, 'x-company-id'],
      [/role.?assignment/i, 'x-role-assignment-id'],
      [/language/i, 'x-language-id'],
      [/tenant/i, 'x-tenant-id'],
      [/organization/i, 'x-organization-id'],
      [/org.?id/i, 'x-org-id']
    ];

    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (!key) continue;
      const raw = store.getItem(key);
      if (!raw) continue;

      if (/^x-[a-z0-9-]+$/i.test(key)) {
        out[key] = raw;
        continue;
      }
      if (/^authorization$/i.test(key)) {
        const b = bearerFrom(raw);
        if (b) out.Authorization = b;
        continue;
      }

      for (const [pattern, headerName] of headerAliases) {
        if (pattern.test(key) && raw.length > 0 && raw.length < 512) {
          out[headerName] = raw;
        }
      }

      if (/auth|token|jwt|bearer|session/i.test(key)) {
        const direct = bearerFrom(raw);
        if (direct) out.Authorization = direct;
        try {
          const parsed = JSON.parse(raw);
          const body = parsed?.body || parsed;
          const token =
            body?.access_token ||
            body?.accessToken ||
            body?.id_token ||
            body?.idToken ||
            parsed?.access_token ||
            parsed?.accessToken;
          const b = bearerFrom(token);
          if (b) out.Authorization = b;
        } catch {}
      }
    }
    return out;
  };

  const fromStorage = mergeHeaders(
    scanStorage(localStorage),
    scanStorage(sessionStorage)
  );
  if (Object.keys(fromStorage).length) {
    sources.push('storage');
    candidates.push(fromStorage);
  }

  try {
    const cached = JSON.parse(sessionStorage.getItem('__apolloAuth') || 'null');
    if (cached?.headers && Object.keys(cached.headers).length) {
      sources.push('cache');
      candidates.push(cached.headers);
    }
  } catch {}

  const deadline = Date.now() + listenMs;
  while (Date.now() < deadline && !graphqlSeen) {
    await new Promise(r => setTimeout(r, 400));
  }
  if (Object.keys(intercepted).length) {
    sources.push('traffic');
    candidates.push(intercepted);
  }

  const mergedGuess = mergeHeaders(fromStorage, intercepted, ...candidates);

  const probeQuery = '{ __typename }';
  const probeBody = JSON.stringify({ query: probeQuery });

  const tryProbe = async (headers) => {
    try {
      const res = await origFetch.call(window, graphqlUrl, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: probeBody
      });
      let json = null;
      try { json = await res.clone().json(); } catch {}
      const gqlOk = res.ok && json && (!json.errors || json.data?.__typename);
      return { ok: gqlOk || (res.ok && !json?.errors?.length), status: res.status, json };
    } catch (e) {
      return { ok: false, status: 0, error: String(e) };
    }
  };

  const probeOrder = [
    { label: 'cookie-only', headers: {} },
    ...candidates.map((h, i) => ({ label: 'candidate-' + i, headers: h })),
    { label: 'merged', headers: mergedGuess }
  ];

  let best = { headers: {}, probeOk: false, probeStatus: 0 };

  for (const attempt of probeOrder) {
    const result = await tryProbe(attempt.headers);
    if (result.ok) {
      best = { headers: attempt.headers, probeOk: true, probeStatus: result.status };
      sources.push('probe:' + attempt.label);
      break;
    }
  }

  if (!best.probeOk && Object.keys(mergedGuess).length) {
    best = { headers: mergedGuess, probeOk: false, probeStatus: 0 };
    sources.push('probe:fallback-guess');
  }

  const payload = {
    headers: best.headers,
    graphqlSeen: graphqlSeen || best.probeOk,
    probeOk: best.probeOk,
    sources: [...new Set(sources)]
  };
  sessionStorage.setItem('__apolloAuth', JSON.stringify(payload));
  return payload;
})()`;
}
function buildPersistHeadersScript(headers, meta) {
    const payload = JSON.stringify({
        headers,
        graphqlSeen: true,
        probeOk: meta?.probeOk,
        sources: meta?.sources ?? ["cross-tab"]
    });
    return `sessionStorage.setItem('__apolloAuth', ${JSON.stringify(payload)}); true;`;
}
function mergeDetectedHeaders(...parts) {
    const headers = {};
    const sources = new Set();
    let graphqlSeen = false;
    let probeOk = false;
    for (const part of parts) {
        if (!part)
            continue;
        Object.assign(headers, part.headers);
        if (part.graphqlSeen)
            graphqlSeen = true;
        if ("probeOk" in part && part.probeOk)
            probeOk = true;
        if ("sources" in part && part.sources) {
            for (const s of part.sources)
                sources.add(s);
        }
    }
    return {
        headers,
        graphqlSeen: graphqlSeen || probeOk,
        probeOk,
        sources: [...sources]
    };
}
//# sourceMappingURL=header-detection.js.map