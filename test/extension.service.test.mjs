import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  autoDetectHeaders,
  fillSandbox,
  getBaseConfig,
  getResolvedConfig,
  resolveSandboxDocument,
  resolveSandboxVariablesJson,
  runApolloCommand,
  runOperation,
  throwDetectFailure
} from "../dist/extension.service.js";
import {
  createMockBrowser,
  createMockVscode,
  defaultSandboxConfig
} from "./helpers/mock-vscode.mjs";

const CONFIG = { ...defaultSandboxConfig };
const REAL_OP = "query Employees { items { id } }";
const TRAFFIC_AUTH = {
  headers: {
    Authorization: "Bearer live",
    "X-Company-Id": "1",
    "X-Role-Assignment-Id": "2",
    "X-Language-Id": "3"
  },
  operation: REAL_OP,
  variablesJson: '{\n  "take": 10\n}',
  probeOk: true,
  sources: ["traffic"],
  graphqlSeen: true
};

function authBrowser(overrides = {}) {
  return createMockBrowser({
    getEnrichedTabContext: async () => ({
      tabs: [
        { viewId: "app-1", url: "https://localhost:3001/en/app" },
        { viewId: "gql-1", url: "https://localhost:3001/graphql" }
      ],
      activeViewId: "app-1"
    }),
    waitForLoad: async () => undefined,
    runInTab: async (script) => {
      const s = String(script);
      if (s.includes("__apolloSandboxTrafficHook")) return true;
      if (s.includes("'session-cache'") && !s.includes("listenMs")) return null;
      if (s.includes("listenMs")) return TRAFFIC_AUTH;
      if (s.trimStart().startsWith("sessionStorage.setItem('__apolloAuth'")) return true;
      if (s.includes("#embeddableSandbox")) {
        return { ok: true, headerKeys: ["Authorization"], schemaReady: true };
      }
      if (s.includes("const query =") && s.includes("fetch(")) {
        return { data: { ok: true }, ms: 12 };
      }
      return TRAFFIC_AUTH;
    },
    ...overrides
  });
}

describe("getBaseConfig", () => {
  it("uses workspace defaults and tolerates invalid variables JSON", () => {
    const api = createMockVscode({
      config: {
        graphqlUrl: "http://localhost:4000/graphql",
        defaultVariables: "{bad json"
      }
    });
    const cfg = getBaseConfig(api);
    assert.equal(cfg.graphqlUrl, "http://localhost:4000/graphql");
    assert.equal(cfg.defaultVariablesJson, "{bad json");
    assert.equal(cfg.sandboxWaitMs, 12000);
  });

  it("falls back when settings omit optional fields", () => {
    const api = createMockVscode({ config: {} });
    const cfg = getBaseConfig(api);
    assert.match(cfg.graphqlUrl, /graphql/);
    assert.match(cfg.defaultOperation, /__typename/);
  });
});

describe("getResolvedConfig", () => {
  it("delegates to browser tab resolution", async () => {
    const api = createMockVscode({
      config: { graphqlUrl: "http://localhost:3001/graphql", graphqlUrlFromBrowserTab: true }
    });
    const browser = createMockBrowser({
      getEnrichedTabContext: async () => ({
        tabs: [{ viewId: "g", url: "https://dev.com/graphql" }],
        activeViewId: "g"
      })
    });
    const resolved = await getResolvedConfig(api, browser);
    assert.equal(resolved.graphqlUrlSource, "browserTab");
    assert.equal(resolved.graphqlUrl, "https://dev.com/graphql");
  });
});

describe("resolveSandboxDocument", () => {
  it("prefers captured non-probe operation", () => {
    assert.equal(resolveSandboxDocument(TRAFFIC_AUTH, CONFIG), REAL_OP);
  });

  it("falls back to default operation for probes", () => {
    assert.equal(
      resolveSandboxDocument(
        { headers: {}, operation: "query ExampleQuery { __typename }" },
        CONFIG
      ),
      CONFIG.defaultOperation
    );
  });
});

describe("resolveSandboxVariablesJson", () => {
  it("pretty-prints captured variables for real operations", () => {
    assert.match(resolveSandboxVariablesJson(TRAFFIC_AUTH, CONFIG), /"take": 10/);
  });

  it("uses config default for probe operations", () => {
    assert.equal(
      resolveSandboxVariablesJson(
        { headers: {}, operation: "query ExampleQuery { __typename }" },
        { ...CONFIG, defaultVariablesJson: '{"a":1}' }
      ),
      '{\n  "a": 1\n}'
    );
  });
});

describe("autoDetectHeaders", () => {
  it("returns merged traffic capture from app tabs", async () => {
    const auth = await autoDetectHeaders(authBrowser(), CONFIG);
    assert.equal(auth.headers.Authorization, "Bearer live");
    assert.match(auth.operation, /Employees/);
  });

  it("tags partial headers when required auth headers missing", async () => {
    const auth = await autoDetectHeaders(
      authBrowser({
        runInTab: async () => ({
          headers: { Authorization: "Bearer only" },
          operation: REAL_OP,
          sources: ["traffic"],
          probeOk: true
        })
      }),
      CONFIG
    );
    assert.ok(auth.sources?.includes("traffic-partial-headers"));
  });

  it("retries until operation found across passes", async () => {
    let detectCalls = 0;
    const auth = await autoDetectHeaders(
      authBrowser({
        runInTab: async (script) => {
          const s = String(script);
          if (s.includes("__apolloSandboxTrafficHook")) return true;
          if (s.includes("'session-cache'") && !s.includes("listenMs")) return null;
          if (s.includes("listenMs")) {
            detectCalls += 1;
            if (detectCalls < 3) {
              return { headers: { Authorization: "Bearer x" }, sources: ["traffic"] };
            }
            return TRAFFIC_AUTH;
          }
          return TRAFFIC_AUTH;
        }
      }),
      CONFIG
    );
    assert.match(auth.operation, /Employees/);
    assert.ok(detectCalls >= 3);
  });

  it("hooks active tab when no app tabs exist", async () => {
    let hookOnActive = false;
    await autoDetectHeaders(
      authBrowser({
        getEnrichedTabContext: async () => ({ tabs: [], activeViewId: undefined }),
        runInTab: async (script, opts) => {
          if (String(script).includes("__apolloSandboxTrafficHook") && opts?.allowNonGraphqlTab) {
            hookOnActive = true;
          }
          return TRAFFIC_AUTH;
        }
      }),
      CONFIG
    );
    assert.equal(hookOnActive, true);
  });

  it("throws when no headers captured after search passes", async () => {
    await assert.rejects(
      () =>
        autoDetectHeaders(
          authBrowser({
            runInTab: async () => ({ headers: {}, sources: ["no-graphql-traffic"] })
          }),
          CONFIG
        ),
      /Could not capture headers/
    );
  });

  it("throws when headers exist but no real operation", async () => {
    await assert.rejects(
      () =>
        autoDetectHeaders(
          authBrowser({
            runInTab: async () => ({
              headers: { Authorization: "Bearer x" },
              operation: "query ExampleQuery { __typename }",
              sources: ["traffic"]
            })
          }),
          CONFIG
        ),
      /Could not capture a GraphQL operation/
    );
  });

  it("reads session cache from active view when no app tabs", async () => {
    let cacheRead = false;
    await autoDetectHeaders(
      authBrowser({
        getEnrichedTabContext: async () => ({ tabs: [], activeViewId: undefined }),
        runInTab: async (script) => {
          const s = String(script);
          if (s.includes("'session-cache'") && !s.includes("listenMs")) {
            cacheRead = true;
            return TRAFFIC_AUTH;
          }
          if (s.includes("__apolloSandboxTrafficHook")) return true;
          if (s.includes("listenMs")) return TRAFFIC_AUTH;
          return true;
        }
      }),
      CONFIG
    );
    assert.equal(cacheRead, true);
  });

  it("persists merged headers and tags partial auth after successful detect", async () => {
    let persisted = false;
    const auth = await autoDetectHeaders(
      authBrowser({
        runInTab: async (script) => {
          const s = String(script);
          if (s.includes("__apolloSandboxTrafficHook")) return true;
          if (s.includes("'session-cache'") && !s.includes("listenMs")) return null;
          if (s.trimStart().startsWith("sessionStorage.setItem('__apolloAuth'")) {
            persisted = true;
            return true;
          }
          if (s.includes("listenMs")) {
            return {
              headers: { Authorization: "Bearer only" },
              operation: REAL_OP,
              sources: ["traffic"]
            };
          }
          return true;
        }
      }),
      CONFIG
    );
    assert.equal(persisted, true);
    assert.ok(auth.sources?.includes("traffic-partial-headers"));
  });

  it("ignores detect failures on individual tabs", async () => {
    const auth = await autoDetectHeaders(
      authBrowser({
        runInTab: async (script, opts) => {
          if (opts?.hintViewId === "app-1" && String(script).includes("listenMs")) {
            throw new Error("tab script failed");
          }
          return TRAFFIC_AUTH;
        }
      }),
      CONFIG
    );
    assert.match(auth.operation, /Employees/);
  });
});

describe("throwDetectFailure", () => {
  it("throws finalize error when merged capture looks complete", () => {
    assert.throws(
      () =>
        throwDetectFailure([
          {
            headers: { Authorization: "Bearer x" },
            operation: REAL_OP,
            sources: ["traffic"]
          }
        ]),
      /Could not finalize captured GraphQL auth/
    );
  });
});

describe("fillSandbox", () => {
  it("returns header keys from fill result", async () => {
    const keys = await fillSandbox(authBrowser(), CONFIG, TRAFFIC_AUTH);
    assert.deepEqual(keys, ["Authorization"]);
  });

  it("throws when fill script reports an error", async () => {
    await assert.rejects(
      () =>
        fillSandbox(
          authBrowser({
            runInTab: async () => ({ err: "Not on an Apollo Server Sandbox page" })
          }),
          CONFIG,
          TRAFFIC_AUTH
        ),
      /Not on an Apollo Server Sandbox page/
    );
  });

  it("falls back to auth header keys when fill result omits them", async () => {
    const keys = await fillSandbox(
      authBrowser({
        runInTab: async () => ({ ok: true })
      }),
      CONFIG,
      TRAFFIC_AUTH
    );
    assert.ok(keys.includes("Authorization"));
  });
});

describe("runOperation", () => {
  it("returns data and timing from browser fetch script", async () => {
    const result = await runOperation(authBrowser(), CONFIG, TRAFFIC_AUTH);
    assert.deepEqual(result.data, { ok: true });
    assert.equal(result.ms, 12);
  });

  it("uses defaults when auth omitted", async () => {
    await runOperation(authBrowser(), CONFIG);
  });

  it("throws when browser returns nothing", async () => {
    await assert.rejects(
      () =>
        runOperation(
          authBrowser({ runInTab: async () => undefined }),
          CONFIG,
          TRAFFIC_AUTH
        ),
      /No response from browser/
    );
  });

  it("throws on script err field", async () => {
    await assert.rejects(
      () =>
        runOperation(
          authBrowser({ runInTab: async () => ({ err: "fetch blocked" }) }),
          CONFIG,
          TRAFFIC_AUTH
        ),
      /fetch blocked/
    );
  });

  it("throws on GraphQL errors array", async () => {
    await assert.rejects(
      () =>
        runOperation(
          authBrowser({
            runInTab: async () => ({ errors: ["Unauthorized", "Bad input"] })
          }),
          CONFIG,
          TRAFFIC_AUTH
        ),
      /Unauthorized; Bad input/
    );
  });
});

describe("runApolloCommand", () => {
  it("runs task inside withProgress", async () => {
    const vscode = createMockVscode();
    let ran = false;
    await runApolloCommand(vscode, "Test progress", async () => {
      ran = true;
    });
    assert.equal(ran, true);
  });

  it("shows browser tab help when Cursor browser APIs fail", async () => {
    const vscode = createMockVscode();
    await runApolloCommand(vscode, "Test progress", async () => {
      throw new Error("Browser view not found");
    });
    assert.equal(vscode.errorMessages.length, 1);
    assert.match(vscode.errorMessages[0], /Cursor browser tab issue/);
  });

  it("rethrows unexpected errors from the task", async () => {
    const vscode = createMockVscode();
    await assert.rejects(
      () =>
        runApolloCommand(vscode, "Test progress", async () => {
          throw new Error("unexpected boom");
        }),
      /unexpected boom/
    );
  });
});
