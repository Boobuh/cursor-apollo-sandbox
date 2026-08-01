import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  filterGraphqlTrafficHeaders,
  isAllowedGraphqlTrafficHeader,
  isOperationCaptureSource,
  mergeDetectedHeaders,
  normalizeVariablesJson,
  parseGraphqlRequestBody
} from "../dist/apollo/header-detection.js";

describe("header-detection edge cases", () => {
  it("filterGraphqlTrafficHeaders skips empty values", () => {
    assert.deepEqual(
      filterGraphqlTrafficHeaders({
        Authorization: "",
        "X-Company-Id": "1"
      }),
      { "X-Company-Id": "1" }
    );
  });

  it("parseGraphqlRequestBody handles invalid and non-object bodies", () => {
    assert.deepEqual(parseGraphqlRequestBody("{bad"), {});
    assert.deepEqual(parseGraphqlRequestBody([]), {});
    assert.deepEqual(parseGraphqlRequestBody(null), {});
    assert.deepEqual(parseGraphqlRequestBody({ variables: null }).variables, {});
  });

  it("parseGraphqlRequestBody accepts object body directly", () => {
    const parsed = parseGraphqlRequestBody({
      query: "query Q { a }",
      variables: { id: 1 }
    });
    assert.equal(parsed.query, "query Q { a }");
  });

  it("normalizeVariablesJson returns {} when stringify throws", () => {
    const circular = {};
    circular.self = circular;
    assert.equal(normalizeVariablesJson(circular), "{}");
  });

  it("mergeDetectedHeaders pretty-prints invalid variables json as raw string", () => {
    const merged = mergeDetectedHeaders({
      headers: { Authorization: "Bearer x" },
      operation: "query Employees { id }",
      variablesJson: "not-json",
      sources: ["traffic"]
    });
    assert.equal(merged.variablesJson, "not-json");
  });

  it("isAllowedGraphqlTrafficHeader rejects unknown header names", () => {
    assert.equal(isAllowedGraphqlTrafficHeader("X-Custom-Unknown"), false);
    assert.equal(isAllowedGraphqlTrafficHeader("Authorization"), true);
    assert.equal(isAllowedGraphqlTrafficHeader("X-Datadog-Trace-Id"), false);
  });

  it("isOperationCaptureSource recognizes traffic and session-cache", () => {
    assert.equal(isOperationCaptureSource("traffic"), true);
    assert.equal(isOperationCaptureSource("session-cache"), true);
    assert.equal(isOperationCaptureSource("apollo-link"), true);
    assert.equal(isOperationCaptureSource("manual"), false);
  });

  it("mergeDetectedHeaders keeps probe when both parts are probes", () => {
    const merged = mergeDetectedHeaders(
      {
        headers: { Authorization: "Bearer a" },
        operation: "query ExampleQuery { __typename }",
        variablesJson: "{}",
        sources: ["traffic"]
      },
      {
        headers: { Authorization: "Bearer b" },
        operation: "query OtherProbe { __typename }",
        variablesJson: '{"a":1}',
        sources: ["apollo-link"]
      }
    );
    assert.match(merged.operation, /__typename/);
  });
});
