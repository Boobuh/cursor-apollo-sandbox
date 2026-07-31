/** Headers captured from live GraphQL traffic (Authorization, API keys, custom headers). */
export interface CapturedGraphqlAuth {
  headers: Record<string, string>;
  graphqlSeen?: boolean;
}

export interface SandboxConfig {
  authCaptureUrl: string;
  graphqlUrl: string;
  graphqlUrlMatch: string;
  sandboxWaitMs: number;
  defaultOperation: string;
  defaultVariablesJson: string;
}
