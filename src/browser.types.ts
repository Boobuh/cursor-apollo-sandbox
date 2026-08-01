/** Minimal command executor used by CursorBrowser (mockable in tests). */
export interface BrowserCommandsExecutor {
  executeCommand<T = unknown>(
    command: string,
    ...rest: unknown[]
  ): Thenable<T>;
}

export interface BrowserTab {
  viewId: string;
  url?: string;
  title?: string;
}

export interface BrowserTabContext {
  tabs: BrowserTab[];
  activeViewId?: string;
  lastInteractedViewId?: string;
}

export interface EnsureBrowserTabOptions {
  createIfMissing?: boolean;
}

export interface RunInTabOptions {
  hintViewId?: string;
  targetUrl?: string;
  /** Run on logged-in app tabs (same host, not /graphql) — for header capture. */
  allowNonGraphqlTab?: boolean;
  authCaptureUrl?: string;
  /** Navigate the active browser view to targetUrl when tab list is empty or wrong page. */
  navigateToTargetUrl?: boolean;
}

/** Synthetic view id when listTabs is empty but getURL works on the active view. */
export const ACTIVE_VIEW_ID = "__active__";

export const BROWSER_VIEW_ERROR_MARKERS = [
  "Browser view not found",
  "No browser view available",
  "Browser tab not found"
] as const;

export const BROWSER_TAB_HELP =
  "Focus a logged-in tab that has sent at least one /graphql request, then retry Setup.";
