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

/** Options for running JS in the embedded browser without brittle viewId passing. */
export interface RunInTabOptions {
  /** Hint for selectTab only — never forwarded to executeJavaScript. */
  hintViewId?: string;
  /** Match and focus a tab by URL before running script. */
  targetUrl?: string;
}

export const BROWSER_VIEW_ERROR_MARKERS = [
  "Browser view not found",
  "No browser view available",
  "Browser tab not found"
] as const;

export const BROWSER_TAB_HELP =
  "Focus your GraphQL /graphql tab in the Cursor browser (open it yourself if an agent opened it), then retry.";
