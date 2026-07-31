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

export interface SandboxConfig {
  authCaptureUrl: string;
  graphqlUrl: string;
  graphqlUrlMatch: string;
  sandboxWaitMs: number;
  headerDetectMs: number;
  defaultOperation: string;
  defaultVariablesJson: string;
}
