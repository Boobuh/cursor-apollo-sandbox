"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.collectTargetHosts = collectTargetHosts;
exports.endpointHint = endpointHint;
exports.headerSummary = headerSummary;
function collectTargetHosts(config) {
    const hosts = new Set();
    for (const raw of [config.graphqlUrl, config.authCaptureUrl.trim()]) {
        if (!raw)
            continue;
        try {
            hosts.add(new URL(raw).hostname);
        }
        catch {
            /* ignore invalid URL */
        }
    }
    return hosts;
}
function endpointHint(config) {
    if (config.graphqlUrlSource !== "browserTab")
        return "";
    return ` — endpoint from browser tab (${config.graphqlUrl})`;
}
function headerSummary(auth) {
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
//# sourceMappingURL=extension.helpers.js.map