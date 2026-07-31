import * as vscode from "vscode";

export interface BrowserTab {
  viewId: string;
  url?: string;
  title?: string;
}

interface ListTabsResult {
  tabs?: Array<{ viewId: string; url?: string; title?: string }>;
  activeViewId?: string;
  lastInteractedViewId?: string;
}

/** Thin wrapper around Cursor's built-in embedded browser commands. */
export class CursorBrowser {
  constructor(private readonly commands: typeof vscode.commands) {}

  async listTabs(): Promise<BrowserTab[]> {
    const result = (await this.commands.executeCommand(
      "cursor.browserView.listTabs"
    )) as ListTabsResult | undefined;
    return result?.tabs ?? [];
  }

  async resolveViewId(preferredUrl?: string): Promise<string | undefined> {
    const tabs = await this.listTabs();
    if (preferredUrl) {
      const match = tabs.find((t) => t.url?.includes(preferredUrl));
      if (match) return match.viewId;
    }
    const list = (await this.commands.executeCommand(
      "cursor.browserView.listTabs"
    )) as ListTabsResult | undefined;
    return list?.lastInteractedViewId ?? list?.activeViewId ?? tabs[0]?.viewId;
  }

  async newTab(url: string): Promise<string | undefined> {
    const viewId = (await this.commands.executeCommand(
      "cursor.browserView.newTab",
      url
    )) as string | undefined;
    return viewId;
  }

  async navigate(url: string, viewId?: string): Promise<void> {
    await this.commands.executeCommand(
      "cursor.browserView.navigate",
      url,
      viewId
    );
  }

  async getUrl(viewId?: string): Promise<string | undefined> {
    return (await this.commands.executeCommand(
      "cursor.browserView.getURL",
      viewId
    )) as string | undefined;
  }

  async executeJavaScript<T>(
    script: string,
    viewId?: string
  ): Promise<T | undefined> {
    return (await this.commands.executeCommand(
      "cursor.browserView.executeJavaScript",
      script,
      viewId
    )) as T | undefined;
  }

  async waitForLoad(ms: number): Promise<void> {
    await new Promise((r) => setTimeout(r, ms));
  }
}

export async function ensureBrowserTab(
  browser: CursorBrowser,
  url: string,
  viewId?: string
): Promise<string> {
  if (viewId) {
    await browser.navigate(url, viewId);
    await browser.waitForLoad(1500);
    return viewId;
  }

  const existing = await browser.resolveViewId(new URL(url).host);
  if (existing) {
    await browser.navigate(url, existing);
    await browser.waitForLoad(1500);
    return existing;
  }

  const created = await browser.newTab(url);
  if (!created) {
    throw new Error("Could not open Cursor browser tab");
  }
  await browser.waitForLoad(2500);
  return created;
}
