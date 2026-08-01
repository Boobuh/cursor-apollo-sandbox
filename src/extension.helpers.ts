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

import { isTrivialProbeQuery } from "./apollo/header-detection";

export function headerSummary(auth: CapturedGraphqlAuth): string {
  const keys = Object.keys(auth.headers);
  const sources = auth.sources?.length
    ? ` (${auth.sources.join(", ")})`
    : "";
  const verified = auth.probeOk ? " — probe OK" : "";

  if (!keys.length) {
    return `No GraphQL traffic headers captured${sources}.`;
  }

  return `Captured ${keys.length} header(s) from GraphQL network traffic: ${keys.join(", ")}${sources}${verified}.`;
}

export function captureSummary(auth: CapturedGraphqlAuth): string {
  const base = headerSummary(auth);
  const operation = auth.operation?.trim();
  if (!operation || isTrivialProbeQuery(operation)) {
    return base;
  }
  const opPreview = operation.replace(/\s+/g, " ").trim().slice(0, 48);
  const varsHint =
    auth.variablesJson && auth.variablesJson.trim() !== "{}"
      ? " + variables"
      : "";
  return `${base} Operation from traffic: ${opPreview}${opPreview.length < operation.length ? "…" : ""}${varsHint}.`;
}
