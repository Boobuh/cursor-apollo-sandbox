#!/usr/bin/env node
/**
 * Spawns Cursor with this extension in dev mode and runs in-host E2E self-tests.
 * Tests real cursor.browserView.* APIs inside the extension host.
 *
 * Usage: npm run test:e2e
 */
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionRoot = path.resolve(__dirname, "../..");
const workspace = path.join(extensionRoot, "test", "e2e", "workspace");
const resultsPath = path.join(extensionRoot, "tmp", "e2e-results.json");
const triggerPath = path.join(extensionRoot, "tmp", "e2e-trigger.json");

function resolveCursorExecutable() {
  for (const candidate of [
    process.env.CURSOR_EXECUTABLE_PATH,
    process.env.CURSOR_PATH,
    "/home/oleh/.local/bin/cursor",
    "/usr/share/cursor/bin/cursor"
  ].filter(Boolean)) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const cursor = resolveCursorExecutable();
  if (!cursor) {
    console.error(
      "Cursor executable not found. Set CURSOR_EXECUTABLE_PATH or install Cursor."
    );
    process.exit(1);
  }

  const build = spawnSync("npm", ["run", "build"], {
    cwd: extensionRoot,
    stdio: "inherit",
    shell: true
  });
  if (build.status !== 0) process.exit(build.status ?? 1);

  mkdirSync(path.dirname(resultsPath), { recursive: true });
  rmSync(resultsPath, { force: true });

  writeFileSync(
    triggerPath,
    JSON.stringify(
      {
        resultsPath,
        graphqlUrl:
          process.env.APOLLO_E2E_GRAPHQL_URL ?? "http://localhost:3001/graphql"
      },
      null,
      2
    )
  );

  const args = [
    "--extensionDevelopmentPath=" + extensionRoot,
    "--new-window",
    workspace
  ];

  console.log(`Cursor E2E: ${cursor}`);
  console.log(`Workspace: ${workspace}`);
  console.log(`Results: ${resultsPath}`);

  const child = spawn(cursor, args, {
    env: {
      ...process.env,
      APOLLO_E2E_GRAPHQL_URL:
        process.env.APOLLO_E2E_GRAPHQL_URL ?? "http://localhost:3001/graphql"
    },
    stdio: "ignore",
    detached: true
  });
  child.unref();

  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (existsSync(resultsPath)) {
      await sleep(500);
      const payload = JSON.parse(readFileSync(resultsPath, "utf8"));
      const results = payload.results ?? [];
      const failed = results.filter((r) => !r.ok);
      const skipped = results.filter((r) => r.skipped);

      for (const r of results) {
        const tag = r.skipped ? "SKIP" : r.ok ? "PASS" : "FAIL";
        console.log(`${tag} ${r.name}${r.error ? ` — ${r.error}` : ""}`);
      }

      console.log(
        `\nE2E summary: ${results.length - failed.length - skipped.length} passed, ${skipped.length} skipped, ${failed.length} failed`
      );

      process.exit(failed.length ? 1 : 0);
    }
    await sleep(1000);
  }

  console.error("Timed out waiting for E2E results (120s)");
  rmSync(triggerPath, { force: true });
  process.exit(1);
}

main();
