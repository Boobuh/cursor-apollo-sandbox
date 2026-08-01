import {
  BROWSER_VIEW_ERROR_MARKERS,
  ACTIVE_VIEW_ID,
  type BrowserTab,
  type BrowserTabContext
} from "./browser.types";

export function isBrowserViewError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return BROWSER_VIEW_ERROR_MARKERS.some((m) => msg.includes(m));
}

export function browserTabMatchesUrl(current: string, expected: string): boolean {
  try {
    const a = new URL(current);
    const b = new URL(expected);
    return (
      a.host === b.host &&
      normalizePath(a.pathname) === normalizePath(b.pathname)
    );
  } catch {
    return false;
  }
}

export function normalizePath(pathname: string): string {
  return pathname.replace(/\/+$/, "") || "/";
}

export function tabUrlHasGraphqlPath(url?: string): boolean {
  if (!url) return false;
  return url.toLowerCase().includes("/graphql");
}

export function isSelectableViewId(viewId?: string): boolean {
  return Boolean(viewId && !viewId.startsWith("__index_"));
}

export function normalizeBrowserTab(raw: unknown, index: number): BrowserTab | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const record = raw as Record<string, unknown>;
  const viewId = [record.viewId, record.id, record.tabId, record.view_id].find(
    (value): value is string => typeof value === "string" && value.length > 0
  );
  const url =
    typeof record.url === "string"
      ? record.url
      : typeof record.href === "string"
        ? record.href
        : undefined;
  const title = typeof record.title === "string" ? record.title : undefined;
  if (!viewId && !url && !title) return undefined;
  return {
    viewId: viewId ?? `__index_${index}`,
    url,
    title
  };
}

export function normalizeBrowserTabs(raw: unknown): BrowserTab[] {
  if (!Array.isArray(raw)) return [];
  const tabs: BrowserTab[] = [];
  for (let index = 0; index < raw.length; index += 1) {
    const tab = normalizeBrowserTab(raw[index], index);
    if (tab) tabs.push(tab);
  }
  return tabs;
}

function pickOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Normalize cursor.browserView.listTabs payloads across Cursor versions. */
export function parseListTabsResult(raw: unknown): BrowserTabContext {
  if (Array.isArray(raw)) {
    return { tabs: normalizeBrowserTabs(raw) };
  }
  if (!raw || typeof raw !== "object") {
    return { tabs: [] };
  }
  const record = raw as Record<string, unknown>;
  const tabs = normalizeBrowserTabs(
    record.tabs ?? record.views ?? record.browserTabs ?? record.items
  );
  return {
    tabs,
    activeViewId: pickOptionalString(
      record.activeViewId ?? record.activeId ?? record.activeTabId
    ),
    lastInteractedViewId: pickOptionalString(
      record.lastInteractedViewId ??
        record.lastActiveViewId ??
        record.lastInteractedTabId
    )
  };
}

/** When listTabs is empty, synthesize a tab from the active browser view URL. */
export function augmentContextWithActiveView(
  ctx: BrowserTabContext,
  activeUrl?: string
): BrowserTabContext {
  if (!activeUrl) return ctx;

  const activeTab: BrowserTab = {
    viewId: ACTIVE_VIEW_ID,
    url: activeUrl
  };

  if (!ctx.tabs.length) {
    return {
      tabs: [activeTab],
      activeViewId: ACTIVE_VIEW_ID,
      lastInteractedViewId: ACTIVE_VIEW_ID
    };
  }

  const alreadyListed = ctx.tabs.some(
    (tab) => tab.url === activeUrl || tab.viewId === ACTIVE_VIEW_ID
  );
  if (alreadyListed) {
    return {
      ...ctx,
      activeViewId: ctx.activeViewId ?? ACTIVE_VIEW_ID,
      lastInteractedViewId: ctx.lastInteractedViewId ?? ACTIVE_VIEW_ID
    };
  }

  return {
    ...ctx,
    tabs: [activeTab, ...ctx.tabs],
    activeViewId: ACTIVE_VIEW_ID,
    lastInteractedViewId: ctx.lastInteractedViewId ?? ACTIVE_VIEW_ID
  };
}

export function collectGraphqlHosts(
  graphqlUrl: string,
  authCaptureUrl?: string
): Set<string> {
  const hosts = new Set<string>();
  for (const raw of [graphqlUrl, authCaptureUrl?.trim()]) {
    if (!raw) continue;
    try {
      hosts.add(new URL(raw).hostname.toLowerCase());
    } catch {
      /* ignore invalid URL */
    }
  }
  return hosts;
}

export function tabMatchesAuthCaptureHost(
  tab: BrowserTab,
  hosts: Set<string>
): boolean {
  if (!tab.url) return true;
  try {
    return hosts.has(new URL(tab.url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function findAuthCaptureTabsInContext(
  ctx: BrowserTabContext,
  graphqlUrl: string,
  authCaptureUrl?: string
): BrowserTab[] {
  const hosts = collectGraphqlHosts(graphqlUrl, authCaptureUrl);
  if (!hosts.size) return [];

  const score = (tab: BrowserTab): number => {
    let value = 0;
    if (tab.viewId === ctx.lastInteractedViewId) value += 100;
    if (tab.viewId === ctx.activeViewId) value += 50;
    return value;
  };

  return ctx.tabs
    .filter(
      (tab) =>
        isSelectableViewId(tab.viewId) &&
        !tabUrlHasGraphqlPath(tab.url) &&
        tabMatchesAuthCaptureHost(tab, hosts)
    )
    .sort((a, b) => score(b) - score(a));
}

export function isGraphqlBrowserTab(tab: BrowserTab): boolean {
  return tabUrlHasGraphqlPath(tab.url);
}

export function findTabByUrlInContext(
  ctx: BrowserTabContext,
  url: string
): BrowserTab | undefined {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return undefined;
  }
  const path = normalizePath(target.pathname);

  const matches = (tabUrl?: string): boolean => {
    if (!tabUrl) return false;
    try {
      const u = new URL(tabUrl);
      return u.host === target.host && normalizePath(u.pathname) === path;
    } catch {
      return false;
    }
  };

  for (const id of [ctx.lastInteractedViewId, ctx.activeViewId]) {
    const tab = ctx.tabs.find((t) => t.viewId === id);
    if (tab && matches(tab.url)) return tab;
  }
  return ctx.tabs.find((t) => matches(t.url));
}

export function findTabByHostInContext(
  ctx: BrowserTabContext,
  host: string
): BrowserTab | undefined {
  return findAllTabsByHostInContext(ctx, host)[0];
}

export function findAllTabsByHostInContext(
  ctx: BrowserTabContext,
  host: string
): BrowserTab[] {
  const hostLower = host.toLowerCase();
  const matchesHost = (tab: BrowserTab): boolean => {
    const url = tab.url?.toLowerCase() ?? "";
    return url.includes(hostLower);
  };
  const seen = new Set<string>();
  const ordered: BrowserTab[] = [];

  const push = (tab: BrowserTab | undefined): void => {
    if (!tab?.viewId || seen.has(tab.viewId) || !matchesHost(tab)) return;
    seen.add(tab.viewId);
    ordered.push(tab);
  };

  for (const id of [ctx.lastInteractedViewId, ctx.activeViewId]) {
    push(ctx.tabs.find((t) => t.viewId === id));
  }
  for (const tab of ctx.tabs) {
    push(tab);
  }

  return ordered;
}

export function findGraphqlTabsInContext(
  ctx: BrowserTabContext,
  targetUrl?: string
): BrowserTab[] {
  const preferredHost = targetUrl
    ? safeUrlHost(targetUrl)?.toLowerCase()
    : undefined;

  const score = (tab: BrowserTab): number => {
    let value = 0;
    if (preferredHost && tab.url?.toLowerCase().includes(preferredHost)) {
      value += 200;
    }
    if (tab.viewId === ctx.lastInteractedViewId) value += 100;
    if (tab.viewId === ctx.activeViewId) value += 50;
    return value;
  };

  return ctx.tabs
    .filter((tab) => tab.viewId && isGraphqlBrowserTab(tab))
    .sort((a, b) => score(b) - score(a));
}

export function collectCandidateViewIds(
  ctx: BrowserTabContext,
  options: {
    hintViewId?: string;
    targetUrl?: string;
    allowNonGraphqlTab?: boolean;
    authCaptureUrl?: string;
  }
): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];

  const push = (id?: string): void => {
    if (!isSelectableViewId(id) || seen.has(id!)) return;
    seen.add(id!);
    ids.push(id!);
  };

  push(options.hintViewId);
  push(ACTIVE_VIEW_ID);
  push(ctx.activeViewId);
  push(ctx.lastInteractedViewId);

  if (options.allowNonGraphqlTab && options.targetUrl) {
    for (const tab of findAuthCaptureTabsInContext(
      ctx,
      options.targetUrl,
      options.authCaptureUrl
    )) {
      push(tab.viewId);
    }
  }

  for (const tab of findGraphqlTabsInContext(ctx, options.targetUrl)) {
    push(tab.viewId);
  }

  for (const tab of ctx.tabs) {
    if (tab.url || !tab.title?.toLowerCase().includes("apollo")) continue;
    push(tab.viewId);
  }

  if (options.targetUrl) {
    const tab = findTabByUrlInContext(ctx, options.targetUrl);
    push(tab?.viewId);
    const host = safeUrlHost(options.targetUrl);
    if (host) {
      for (const t of findAllTabsByHostInContext(ctx, host)) {
        push(t.viewId);
      }
    }
  }

  for (const tab of ctx.tabs) {
    push(tab.viewId);
  }

  return ids;
}

function safeUrlHost(url: string): string | undefined {
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}
