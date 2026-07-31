import type { CursorBrowser } from "../browser";
import type { GraphqlUrlSource, ResolvedSandboxConfig, SandboxConfig } from "./sandbox.types";
import { deriveGraphqlUrlMatch } from "./sandbox";

/** True when the tab URL looks like an Apollo / GraphQL HTTP endpoint page. */
export function isGraphqlEndpointUrl(raw: string): boolean {
  try {
    const { pathname } = new URL(raw);
    return /\/graphql\/?$/i.test(pathname) || pathname.toLowerCase().includes("/graphql");
  } catch {
    return false;
  }
}

/** Strip hash/query; keep origin + path as the GraphQL POST URL. */
export function normalizeGraphqlEndpointUrl(raw: string): string {
  const url = new URL(raw);
  url.hash = "";
  url.search = "";
  let path = url.pathname.replace(/\/+$/, "") || "/";
  if (!path.toLowerCase().includes("graphql")) {
    path = `${path}/graphql`.replace(/\/{2,}/g, "/");
  }
  url.pathname = path;
  return url.toString();
}

export async function resolveSandboxConfig(
  browser: CursorBrowser,
  base: SandboxConfig
): Promise<ResolvedSandboxConfig> {
  if (!base.graphqlUrlFromBrowserTab) {
    return withDerivedMatch(base, "settings");
  }

  const ctx = await browser.getTabContext();
  const candidates: string[] = [];

  const push = (url?: string): void => {
    if (!url || !isGraphqlEndpointUrl(url)) return;
    if (!candidates.includes(url)) candidates.push(url);
  };

  if (ctx.lastInteractedViewId) {
    push(ctx.tabs.find((t) => t.viewId === ctx.lastInteractedViewId)?.url);
  }
  if (ctx.activeViewId && ctx.activeViewId !== ctx.lastInteractedViewId) {
    push(ctx.tabs.find((t) => t.viewId === ctx.activeViewId)?.url);
  }
  for (const tab of ctx.tabs) {
    push(tab.url);
  }

  const picked = candidates[0];
  if (!picked) {
    return withDerivedMatch(base, "settings");
  }

  const graphqlUrl = normalizeGraphqlEndpointUrl(picked);
  return withDerivedMatch(
    {
      ...base,
      graphqlUrl,
      graphqlUrlMatch:
        base.graphqlUrlMatch.trim() || deriveGraphqlUrlMatch(graphqlUrl)
    },
    "browserTab"
  );
}

function withDerivedMatch(
  config: SandboxConfig,
  source: GraphqlUrlSource
): ResolvedSandboxConfig {
  return {
    ...config,
    graphqlUrlSource: source,
    graphqlUrlMatch:
      config.graphqlUrlMatch.trim() || deriveGraphqlUrlMatch(config.graphqlUrl)
  };
}
