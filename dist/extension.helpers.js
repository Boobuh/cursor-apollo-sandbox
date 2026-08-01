"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.collectTargetHosts = collectTargetHosts;
exports.endpointHint = endpointHint;
exports.headerSummary = headerSummary;
exports.captureSummary = captureSummary;
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
const header_detection_1 = require("./apollo/header-detection");
function headerSummary(auth) {
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
function captureSummary(auth) {
    const base = headerSummary(auth);
    const operation = auth.operation?.trim();
    if (!operation || (0, header_detection_1.isTrivialProbeQuery)(operation)) {
        return base;
    }
    const opPreview = operation.replace(/\s+/g, " ").trim().slice(0, 48);
    const varsHint = auth.variablesJson && auth.variablesJson.trim() !== "{}"
        ? " + variables"
        : "";
    return `${base} Operation from traffic: ${opPreview}${opPreview.length < operation.length ? "…" : ""}${varsHint}.`;
}
//# sourceMappingURL=extension.helpers.js.map