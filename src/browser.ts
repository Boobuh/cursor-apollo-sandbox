import {
  ACTIVE_VIEW_ID,
  BROWSER_TAB_HELP,
  type BrowserCommandsExecutor,
  type BrowserTabContext,
  type EnsureBrowserTabOptions,
  type RunInTabOptions
} from "./browser.types";
import {
  augmentContextWithActiveView,
  browserTabMatchesUrl,
  collectCandidateViewIds,
  findAllTabsByHostInContext,
  findGraphqlTabsInContext,
  findTabByUrlInContext,
  isBrowserViewError,
  isSelectableViewId,
  parseListTabsResult,
  tabUrlHasGraphqlPath
} from "./browser.utils";

export type {
  BrowserTab,
  BrowserTabContext,
  EnsureBrowserTabOptions,
  RunInTabOptions
} from "./browser.types";

export class CursorBrowser {
  constructor(private readonly commands: BrowserCommandsExecutor) {}

  async getTabContext(): Promise<BrowserTabContext> {
    try {
      const result = await this.commands.executeCommand(
        "cursor.browserView.listTabs"
      );
      return parseListTabsResult(result);
    } catch {
      return { tabs: [] };
    }
  }

  /** Fill missing tab URLs and synthesize active view when listTabs is empty. */
  async getEnrichedTabContext(): Promise<BrowserTabContext> {
    const ctx = await this.getTabContext();
    const activeUrl = await this.getActiveUrl();
    let enriched = augmentContextWithActiveView(ctx, activeUrl);

    if (!enriched.tabs.some((tab) => tab.viewId && !tab.url)) {
      return enriched;
    }

    const tabs = [...enriched.tabs];
    for (let index = 0; index < tabs.length; index += 1) {
      const tab = tabs[index];
      if (!tab.viewId || tab.url || tab.viewId === ACTIVE_VIEW_ID) continue;
      if (!(await this.selectTab(tab.viewId))) continue;
      await this.waitForLoad(300);
      const url = await this.getActiveUrl();
      if (url) {
        tabs[index] = { ...tab, url };
      }
    }

    enriched = { ...enriched, tabs };
    return augmentContextWithActiveView(enriched, await this.getActiveUrl());
  }

  async listTabs(): Promise<BrowserTabContext["tabs"]> {
    return (await this.getEnrichedTabContext()).tabs;
  }

  async findTabByUrl(url: string): Promise<BrowserTabContext["tabs"][0] | undefined> {
    return findTabByUrlInContext(await this.getEnrichedTabContext(), url);
  }

  async selectTab(viewId: string): Promise<boolean> {
    if (viewId === ACTIVE_VIEW_ID) {
      return true;
    }
    try {
      const result = (await this.commands.executeCommand(
        "cursor.browserView.selectTab",
        viewId
      )) as { success?: boolean } | undefined;
      return result?.success !== false;
    } catch {
      return false;
    }
  }

  async newTab(url: string): Promise<string | undefined> {
    try {
      return (await this.commands.executeCommand(
        "cursor.browserView.newTab",
        url
      )) as string | undefined;
    } catch {
      return undefined;
    }
  }

  private async navigateActive(url: string): Promise<boolean> {
    try {
      await this.commands.executeCommand("cursor.browserView.navigate", url);
      return true;
    } catch {
      return false;
    }
  }

  private async getActiveUrl(): Promise<string | undefined> {
    try {
      return (await this.commands.executeCommand(
        "cursor.browserView.getURL"
      )) as string | undefined;
    } catch {
      return undefined;
    }
  }

  private async runScriptInActiveView<T>(script: string): Promise<T | undefined> {
    return (await this.commands.executeCommand(
      "cursor.browserView.executeJavaScript",
      script
    )) as T | undefined;
  }

  async waitForLoad(ms: number): Promise<void> {
    await new Promise((r) => setTimeout(r, ms));
  }

  async focusGraphqlTab(targetUrl: string): Promise<boolean> {
    const ctx = await this.getEnrichedTabContext();
    for (const viewId of collectCandidateViewIds(ctx, { targetUrl })) {
      if (!(await this.selectTab(viewId))) continue;
      await this.waitForLoad(600);
      const activeUrl = await this.getActiveUrl();
      if (
        activeUrl &&
        (tabUrlHasGraphqlPath(activeUrl) ||
          browserTabMatchesUrl(activeUrl, targetUrl))
      ) {
        return true;
      }
    }

    const activeUrl = await this.getActiveUrl();
    if (activeUrl && !tabUrlHasGraphqlPath(activeUrl)) {
      if (await this.navigateActive(targetUrl)) {
        await this.waitForLoad(1200);
        return true;
      }
    }

    return false;
  }

  private async tryRunScriptInCandidates<T>(
    script: string,
    ctx: BrowserTabContext,
    options: RunInTabOptions
  ): Promise<T | undefined> {
    for (const viewId of collectCandidateViewIds(ctx, options)) {
      if (viewId !== ACTIVE_VIEW_ID && !(await this.selectTab(viewId))) {
        continue;
      }
      await this.waitForLoad(400);
      const activeUrl = await this.getActiveUrl();
      if (
        !options.allowNonGraphqlTab &&
        options.targetUrl &&
        activeUrl &&
        !tabUrlHasGraphqlPath(activeUrl) &&
        !browserTabMatchesUrl(activeUrl, options.targetUrl)
      ) {
        continue;
      }
      try {
        return await this.runScriptInActiveView<T>(script);
      } catch (err) {
        if (!isBrowserViewError(err)) throw err;
      }
    }
    return undefined;
  }

  private async tryRunScriptOnGraphqlTabs<T>(
    script: string,
    ctx: BrowserTabContext,
    targetUrl?: string
  ): Promise<T | undefined> {
    for (const tab of findGraphqlTabsInContext(ctx, targetUrl)) {
      if (tab.viewId !== ACTIVE_VIEW_ID && !(await this.selectTab(tab.viewId))) {
        continue;
      }
      await this.waitForLoad(400);
      try {
        return await this.runScriptInActiveView<T>(script);
      } catch (err) {
        if (!isBrowserViewError(err)) throw err;
      }
    }
    return undefined;
  }

  private async formatTabContextError(
    ctx: BrowserTabContext,
    targetUrl?: string
  ): Promise<string> {
    const graphqlTabs = findGraphqlTabsInContext(ctx, targetUrl);
    const activeUrl = await this.getActiveUrl();
    const summary = ctx.tabs
      .map((tab) => {
        const label = tab.url ?? tab.title ?? "?";
        return `${tab.viewId}:${label}`;
      })
      .join("; ");
    const activePart = activeUrl ? ` active: ${activeUrl}` : "";
    return `Cursor browser unavailable (${ctx.tabs.length} tab(s), ${graphqlTabs.length} with /graphql${summary ? `: ${summary}` : ""}${activePart}). ${BROWSER_TAB_HELP}`;
  }

  private async tryNavigateToTarget(
    targetUrl: string,
    allowNonGraphqlTab?: boolean
  ): Promise<boolean> {
    const activeUrl = await this.getActiveUrl();
    if (
      activeUrl &&
      (tabUrlHasGraphqlPath(activeUrl) ||
        browserTabMatchesUrl(activeUrl, targetUrl))
    ) {
      return true;
    }
    if (allowNonGraphqlTab) {
      return false;
    }
    if (!(await this.navigateActive(targetUrl))) {
      return false;
    }
    await this.waitForLoad(1200);
    return true;
  }

  async runInTab<T>(
    script: string,
    options: RunInTabOptions = {}
  ): Promise<T | undefined> {
    if (options.allowNonGraphqlTab) {
      try {
        return await this.runScriptInActiveView<T>(script);
      } catch (err) {
        if (!isBrowserViewError(err)) throw err;
      }
    } else {
      try {
        const activeUrl = await this.getActiveUrl();
        if (
          !options.targetUrl ||
          !activeUrl ||
          tabUrlHasGraphqlPath(activeUrl) ||
          browserTabMatchesUrl(activeUrl, options.targetUrl)
        ) {
          return await this.runScriptInActiveView<T>(script);
        }
      } catch (err) {
        if (!isBrowserViewError(err)) throw err;
      }
    }

    const ctx = await this.getEnrichedTabContext();

    if (options.allowNonGraphqlTab) {
      const fromApp = await this.tryRunScriptInCandidates<T>(script, ctx, options);
      if (fromApp !== undefined) {
        return fromApp;
      }
    }

    const fromGraphql = await this.tryRunScriptOnGraphqlTabs<T>(
      script,
      ctx,
      options.targetUrl
    );
    if (fromGraphql !== undefined) {
      return fromGraphql;
    }

    const fromCandidates = await this.tryRunScriptInCandidates<T>(
      script,
      ctx,
      options
    );
    if (fromCandidates !== undefined) {
      return fromCandidates;
    }

    for (const tab of ctx.tabs) {
      if (!isSelectableViewId(tab.viewId)) continue;
      if (
        tab.viewId !== ACTIVE_VIEW_ID &&
        !(await this.selectTab(tab.viewId))
      ) {
        continue;
      }
      await this.waitForLoad(400);
      const activeUrl = await this.getActiveUrl();
      if (
        !options.allowNonGraphqlTab &&
        activeUrl &&
        !tabUrlHasGraphqlPath(activeUrl) &&
        options.targetUrl &&
        !browserTabMatchesUrl(activeUrl, options.targetUrl)
      ) {
        continue;
      }
      try {
        return await this.runScriptInActiveView<T>(script);
      } catch (err) {
        if (!isBrowserViewError(err)) throw err;
      }
    }

    if (
      options.navigateToTargetUrl &&
      options.targetUrl &&
      (await this.tryNavigateToTarget(
        options.targetUrl,
        options.allowNonGraphqlTab
      ))
    ) {
      try {
        return await this.runScriptInActiveView<T>(script);
      } catch (err) {
        if (!isBrowserViewError(err)) throw err;
      }
    }

    if (
      !options.allowNonGraphqlTab &&
      options.targetUrl &&
      (await this.focusGraphqlTab(options.targetUrl))
    ) {
      try {
        return await this.runScriptInActiveView<T>(script);
      } catch (err) {
        if (!isBrowserViewError(err)) throw err;
      }
    }

    throw new Error(
      await this.formatTabContextError(ctx, options.targetUrl)
    );
  }

  async ensureBrowserTab(
    url: string,
    options: EnsureBrowserTabOptions = {}
  ): Promise<void> {
    const createIfMissing = options.createIfMissing ?? false;

    if (await this.focusGraphqlTab(url)) {
      const current = await this.getActiveUrl();
      if (!current || !browserTabMatchesUrl(current, url)) {
        if (await this.navigateActive(url)) {
          await this.waitForLoad(1200);
        }
      }
      return;
    }

    const host = safeHost(url);
    if (host) {
      for (const tab of findAllTabsByHostInContext(
        await this.getEnrichedTabContext(),
        host
      )) {
        if (await this.selectTab(tab.viewId)) {
          await this.waitForLoad(600);
          if (await this.navigateActive(url)) {
            await this.waitForLoad(1200);
          }
          return;
        }
      }
    }

    for (const tab of findGraphqlTabsInContext(
      await this.getEnrichedTabContext(),
      url
    )) {
      if (await this.selectTab(tab.viewId)) {
        await this.waitForLoad(600);
        return;
      }
    }

    const activeUrl = await this.getActiveUrl();
    if (activeUrl && (await this.navigateActive(url))) {
      await this.waitForLoad(1200);
      return;
    }

    if (!createIfMissing) {
      throw new Error(
        `No usable browser tab for ${url}. Focus a logged-in tab with a /graphql request, then retry Setup.`
      );
    }

    const created = await this.newTab(url);
    if (!created) {
      throw new Error(`Could not open Cursor browser tab. ${BROWSER_TAB_HELP}`);
    }
    await this.waitForLoad(2500);
  }
}

function safeHost(url: string): string | undefined {
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}
