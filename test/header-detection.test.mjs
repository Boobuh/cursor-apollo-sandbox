import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildAutoDetectHeadersScript,
  buildPersistHeadersScript,
  mergeDetectedHeaders
} from "../dist/apollo/header-detection.js";

describe("mergeDetectedHeaders", () => {
  it("merges headers and flags from multiple parts", () => {
    const merged = mergeDetectedHeaders(
      { headers: { Authorization: "Bearer a" }, graphqlSeen: true },
      {
        headers: { "X-Company-Id": "1" },
        probeOk: true,
        sources: ["traffic"]
      },
      null,
      undefined
    );
    assert.deepEqual(merged.headers, {
      Authorization: "Bearer a",
      "X-Company-Id": "1"
    });
    assert.equal(merged.graphqlSeen, true);
    assert.equal(merged.probeOk, true);
    assert.deepEqual(merged.sources, ["traffic"]);
  });

  it("sets graphqlSeen when probe succeeds without traffic", () => {
    const merged = mergeDetectedHeaders({
      headers: {},
      probeOk: true,
      sources: ["probe:cookie-only"]
    });
    assert.equal(merged.graphqlSeen, true);
    assert.equal(merged.probeOk, true);
  });
});

describe("buildPersistHeadersScript", () => {
  it("writes __apolloAuth payload to sessionStorage", () => {
    const script = buildPersistHeadersScript(
      { Authorization: "Bearer x" },
      { probeOk: true, sources: ["cross-tab"] }
    );
    assert.match(script, /^sessionStorage\.setItem\('__apolloAuth',/);
    const jsonPart = script.match(
      /sessionStorage\.setItem\('__apolloAuth', (.+)\); true;$/
    )?.[1];
    assert.ok(jsonPart);
    const payload = JSON.parse(JSON.parse(jsonPart));
    assert.deepEqual(payload.headers, { Authorization: "Bearer x" });
    assert.equal(payload.probeOk, true);
    assert.deepEqual(payload.sources, ["cross-tab"]);
  });
});

describe("buildAutoDetectHeadersScript", () => {
  it("embeds graphql URL, match substring, and listen duration", () => {
    const script = buildAutoDetectHeadersScript(
      "https://dev.com/graphql",
      "/graphql",
      6000
    );
    assert.match(script, /^\(async \(\) => \{/);
    assert.match(script, /const graphqlUrl = "https:\/\/dev\.com\/graphql"/);
    assert.match(script, /const urlMatch = "\/graphql"/);
    assert.match(script, /const listenMs = 6000/);
    assert.match(script, /content-length/);
    assert.match(script, /__apolloAuth/);
    assert.match(script, /tryProbe/);
  });
});
