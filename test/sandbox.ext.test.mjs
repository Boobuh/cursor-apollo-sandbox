import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { captureSummary } from "../dist/extension.helpers.js";
import { formatVariablesJson } from "../dist/apollo/sandbox.js";

describe("extension.helpers edge cases", () => {
  it("captureSummary omits operation hint for trivial probes", () => {
    const summary = captureSummary({
      headers: { Authorization: "Bearer x" },
      operation: "query ExampleQuery { __typename }",
      sources: ["traffic"]
    });
    assert.doesNotMatch(summary, /Operation from traffic/);
  });

  it("captureSummary truncates long operations with ellipsis hint", () => {
    const longOp = `query Employees { ${"id ".repeat(40)} }`;
    const summary = captureSummary({
      headers: { Authorization: "Bearer x" },
      operation: longOp,
      sources: ["traffic"]
    });
    assert.match(summary, /Operation from traffic:/);
  });
});

describe("formatVariablesJson edge cases", () => {
  it("returns trimmed raw string for non-object JSON", () => {
    assert.equal(formatVariablesJson("[]"), "[]");
    assert.equal(formatVariablesJson("null"), "null");
  });

  it("returns trimmed input when JSON parse fails", () => {
    assert.equal(formatVariablesJson("  {bad  "), "{bad");
  });
});
