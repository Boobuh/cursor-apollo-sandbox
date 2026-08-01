import {
  BROWSER_TAB_HELP,
  type BrowserCommandsExecutor,
  type BrowserTabContext,
  type RunInTabOptions
} from "./browser.types";
import {
  browserTabMatchesUrl,
  findTabByHostInContext,
  findTabByUrlInContext,
  isBrowserViewError
} from "./browser.utils";

export type { BrowserTab, BrowserTabContext, RunInTabOptions } from "./browser.types";

interface ListTabsResult {
  tabs?: Array<{ viewId: string; url?: string; title?: string }>;
  activeViewId?: string;
  lastInteractedViewId?: string;
}

/**
 * Safe wrapper around Cursor `cursor.browserView.*` commands.
 *
 * NEVER pass viewId to navigate / executeJavaScript / getURL — agent-owned or
 * stale IDs cause "Browser view not found". Use selectTab + active-view commands.
 */
export class CursorBrowser {
  constructor(private readonly commands: BrowserCommandsExecutor) {}

  async getTabContext(): Promise<BrowserTabContext> {
    const result = (await this.commands.executeCommand(
      "cursor.browserView.listTabs"
    )) as ListTabsResult | undefined;
    return {
      tabs: result?.tabs ?? [],
      activeViewId: result?.activeViewId,
      lastInteractedViewId: result?.lastInteractedViewId
    };
  }

  async listTabs(): Promise<BrowserTabContext["tabs"]> {
    return (await this.getTabContext()).tabs;
  }

  async findTabByUrl(url: string): Promise<BrowserTabContext["tabs"][0] | undefined> {
    return findTabByUrlInContext(await this.getTabContext(), url);
  }

  /** selectTab only — safe to pass viewId here. */
  async selectTab(viewId: string): Promise<boolean> {
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

  /** Navigate the active / resolved browser view — never pass viewId. */
  private async navigateActive(url: string): Promise<void> {
    await this.commands.executeCommand("cursor.browserView.navigate", url);
  }

  /** Read URL from active / resolved browser view — never pass viewId. */
  private async getActiveUrl(): Promise<string | undefined> {
    try {
      return (await this.commands.executeCommand(
        "cursor.browserView.getURL"
      )) as string | undefined;
    } catch {
      return undefined;
    }
  }

  /** Run JS in active view — never pass viewId (regression guard). */
  private async runScriptInActiveView<T>(script: string): Promise<T | undefined> {
    return (await this.commands.executeCommand(
      "cursor.browserView.executeJavaScript",
      script
    )) as T | undefined;
  }

  async waitForLoad(ms: number): Promise<void> {
    await new Promise((r) => setTimeout(r, ms));
  }

  /**
   * Focus the best tab for targetUrl / hintViewId, then execute script on the
   * active browser view with fallbacks so "Browser view not found" cannot escape.
   */
  async runInTab<T>(
    script: string,
    options: RunInTabOptions = {}
  ): Promise<T | undefined> {
    await this.focusTabForRun(options);

    try {
      return await this.runScriptInActiveView<T>(script);
    } catch (err) {
      if (!isBrowserViewError(err)) throw err;
    }

    if (options.targetUrl) {
      await this.ensureBrowserTab(options.targetUrl);
      return await this.runScriptInActiveView<T>(script);
    }

    throw new Error(`Cursor browser unavailable. ${BROWSER_TAB_HELP}`);
  }

  private async focusTabForRun(options: RunInTabOptions): Promise<void> {
    const ctx = await this.getTabContext();

    if (options.targetUrl) {
      const byUrl = findTabByUrlInContext(ctx, options.targetUrl);
      if (byUrl && (await this.selectTab(byUrl.viewId))) {
        await this.waitForLoad(400);
        return;
      }
    }

    if (options.hintViewId && (await this.selectTab(options.hintViewId))) {
      await this.waitForLoad(400);
      return;
    }

    if (options.targetUrl) {
      const host = safeHost(options.targetUrl);
      if (host) {
        const byHost = findTabByHostInContext(ctx, host);
        if (byHost && (await this.selectTab(byHost.viewId))) {
          await this.waitForLoad(400);
        }
      }
    }
  }

  /**
   * Ensure a browser tab shows `url`. Never passes viewId to navigate/getURL.
   */
  async ensureBrowserTab(url: string): Promise<void> {
    const existing = await this.findTabByUrl(url);
    if (existing && (await this.selectTab(existing.viewId))) {
      await this.waitForLoad(500);
      const current = await this.getActiveUrl();
      if (current && browserTabMatchesUrl(current, url)) {
        return;
      }
      try {
        await this.navigateActive(url);
        await this.waitForLoad(1500);
        return;
      } catch (err) {
        if (!isBrowserViewError(err)) throw err;
      }
    }

    const host = safeHost(url);
    if (host) {
      const byHost = findTabByHostInContext(await this.getTabContext(), host);
      if (byHost && (await this.selectTab(byHost.viewId))) {
        try {
          await this.navigateActive(url);
          await this.waitForLoad(1500);
          return;
        } catch (err) {
          if (!isBrowserViewError(err)) throw err;
        }
      }
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
