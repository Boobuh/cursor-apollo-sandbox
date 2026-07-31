/** Headers captured from live GraphQL traffic (Authorization, API keys, custom headers). */
export interface CapturedGraphqlAuth {
  headers: Record<string, string>;
  graphqlSeen?: boolean;
  probeOk?: boolean;
  sources?: string[];
}

export interface HeaderDetectionResult extends CapturedGraphqlAuth {
  probeOk: boolean;
  sources: string[];
}

export type GraphqlUrlSource = "settings" | "browserTab";

export interface SandboxConfig {
  authCaptureUrl: string;
  graphqlUrl: string;
  /** When true, use GraphQL URL from an open Cursor browser tab (falls back to graphqlUrl). */
  graphqlUrlFromBrowserTab: boolean;
  graphqlUrlMatch: string;
  sandboxWaitMs: number;
  headerDetectMs: number;
  defaultOperation: string;
  defaultVariablesJson: string;
}

export interface ResolvedSandboxConfig extends SandboxConfig {
  graphqlUrlSource: GraphqlUrlSource;
}
