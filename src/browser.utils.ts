import {
  BROWSER_VIEW_ERROR_MARKERS,
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
  for (const id of [ctx.lastInteractedViewId, ctx.activeViewId]) {
    const tab = ctx.tabs.find((t) => t.viewId === id);
    if (tab?.url?.includes(host)) return tab;
  }
  return ctx.tabs.find((t) => t.url?.includes(host));
}
