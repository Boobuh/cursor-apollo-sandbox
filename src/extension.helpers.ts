import type { CapturedGraphqlAuth, ResolvedSandboxConfig } from "./apollo/sandbox.types";

export function collectTargetHosts(config: ResolvedSandboxConfig): Set<string> {
  const hosts = new Set<string>();
  for (const raw of [config.graphqlUrl, config.authCaptureUrl.trim()]) {
    if (!raw) continue;
    try {
      hosts.add(new URL(raw).hostname);
    } catch {
      /* ignore invalid URL */
    }
  }
  return hosts;
}

export function endpointHint(config: ResolvedSandboxConfig): string {
  if (config.graphqlUrlSource !== "browserTab") return "";
  return ` — endpoint from browser tab (${config.graphqlUrl})`;
}

export function headerSummary(auth: CapturedGraphqlAuth): string {
  const keys = Object.keys(auth.headers);
  const sources = auth.sources?.length
    ? ` (${auth.sources.join(", ")})`
    : "";
  const verified = auth.probeOk ? " — probe OK" : "";

  if (!keys.length) {
    return auth.probeOk || auth.graphqlSeen
      ? `Using cookie session for GraphQL${sources}${verified}.`
      : `No extra headers detected${sources}.`;
  }

  return `Auto-detected ${keys.length} header(s): ${keys.join(", ")}${sources}${verified}.`;
}
