# Cursor E2E tests

Exercises **real** `cursor.browserView.*` APIs inside the Cursor extension host.

## Automated (opens a new Cursor window)

```bash
npm run test:e2e
```

Writes `tmp/e2e-trigger.json` before launch and sets `APOLLO_E2E=1` on the Cursor process. The extension only runs E2E hooks when that env var is set (a leftover trigger file alone will not quit Cursor). On activation it runs checks, writes `tmp/e2e-results.json`, then quits.

Optional:

```bash
APOLLO_E2E_GRAPHQL_URL=https://app.example.com/graphql npm run test:e2e
```

Requires a desktop Cursor install (`CURSOR_EXECUTABLE_PATH` overrides auto-detect).

## Manual (from Extension Development Host)

1. **Run Extension** (F5) with this folder as `extensionDevelopmentPath`
2. Command Palette → **Apollo Sandbox: Run Self Test (E2E)**

Uses live Cursor browser APIs in the current window.
