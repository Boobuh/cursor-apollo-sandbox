import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  browserTabMatchesUrl,
  findTabByHostInContext,
  findTabByUrlInContext,
  isBrowserViewError,
  normalizePath
} from "../dist/browser.utils.js";

describe("isBrowserViewError", () => {
  it("detects Cursor browser view failures", () => {
    assert.equal(isBrowserViewError(new Error("Browser view not found")), true);
    assert.equal(
      isBrowserViewError(new Error("No browser view available")),
      true
    );
    assert.equal(isBrowserViewError(new Error("Browser tab not found")), true);
    assert.equal(isBrowserViewError(new Error("Network error")), false);
  });
});

describe("browserTabMatchesUrl", () => {
  it("matches same host and graphql path", () => {
    assert.equal(
      browserTabMatchesUrl(
        "https://develop.uk.training.lkqacademy.com/graphql",
        "https://develop.uk.training.lkqacademy.com/graphql/"
      ),
      true
    );
    assert.equal(
      browserTabMatchesUrl(
        "https://localhost:3001/graphql",
        "https://develop.uk.training.lkqacademy.com/graphql"
      ),
      false
    );
  });
});

describe("findTabByUrlInContext", () => {
  it("prefers last interacted matching tab", () => {
    const tab = findTabByUrlInContext(
      {
        tabs: [
          { viewId: "a", url: "https://ex.com/graphql" },
          { viewId: "b", url: "https://dev.com/graphql" }
        ],
        lastInteractedViewId: "b",
        activeViewId: "a"
      },
      "https://dev.com/graphql"
    );
    assert.equal(tab?.viewId, "b");
  });
});

describe("normalizePath", () => {
  it("strips trailing slashes and preserves root", () => {
    assert.equal(normalizePath("/graphql/"), "/graphql");
    assert.equal(normalizePath("/"), "/");
    assert.equal(normalizePath(""), "/");
  });
});

describe("findTabByHostInContext", () => {
  it("falls back to host match", () => {
    const tab = findTabByHostInContext(
      {
        tabs: [{ viewId: "z", url: "https://dev.com/dashboard" }],
        activeViewId: "z"
      },
      "dev.com"
    );
    assert.equal(tab?.viewId, "z");
  });
});
