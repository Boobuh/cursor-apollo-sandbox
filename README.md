# Cursor Apollo Sandbox

Fill **Apollo Server Sandbox** inside [Cursor](https://cursor.com)'s embedded browser for **any Apollo GraphQL project** — formatted operation, pretty JSON variables, and **auto-detected request headers**. No Chrome, no CDP patches, no restart.

## Requirements

- **Cursor** with embedded Browser tab (`cursor.browserView.*` commands)
- An Apollo Server GraphQL endpoint (local or remote)
- Optional: a logged-in frontend tab on the same host (improves header detection)

## Install

```bash
git clone https://github.com/Boobuh/cursor-apollo-sandbox.git
cd cursor-apollo-sandbox
npm install
npm run build
ln -s "$(pwd)" ~/.cursor/extensions/cursor-apollo-sandbox
```

Reload Cursor. Set `apolloSandbox.graphqlUrl` and your default operation.

## Quick start

1. Open your app in the Cursor browser (logged in) and/or the GraphQL Sandbox URL.
2. Run **Apollo Sandbox: Setup (auto-detect + fill)**.

The extension discovers headers automatically — no manual copy/paste.

## Auto-detect headers

Before fill or run, the extension:

1. **Listens** for GraphQL `fetch`/XHR on open tabs (same host as `graphqlUrl` / `authCaptureUrl`)
2. **Scans** `localStorage` / `sessionStorage` for Bearer tokens and common custom headers (`x-company-id`, `x-tenant-id`, etc.)
3. **Probes** your endpoint with `{ __typename }` — tries cookie-only, then each candidate header set
4. **Persists** the working set to Sandbox + parent-page relay

Public cookie-only APIs: probe succeeds with `{}` headers. Bearer APIs: token picked up from traffic or storage.

## Commands

| Command | What it does |
| -------- | ------------- |
| **Setup (auto-detect + fill)** | Detect headers → fill Sandbox |
| **Auto-detect Headers** | Run detection only (shows sources: traffic, storage, probe) |
| **Fill Sandbox** | Auto-detect → reload iframe with operation + variables + headers |
| **Run Operation (parent fetch)** | Auto-detect → POST configured operation |
| **Open GraphQL Endpoint** | Open `graphqlUrl` in a browser tab |

Command Palette → **Apollo Sandbox**.

## Settings

| Key | Default | Description |
| ----- | -------- | ------------- |
| `apolloSandbox.graphqlUrl` | `http://localhost:4000/graphql` | Apollo Server Sandbox / GraphQL endpoint |
| `apolloSandbox.authCaptureUrl` | *(empty)* | Extra page to scan (SPA dashboard); same host tabs are scanned automatically |
| `apolloSandbox.graphqlUrlMatch` | *(auto)* | URL substring for GraphQL traffic |
| `apolloSandbox.defaultOperation` | `query ExampleQuery { __typename }` | Multi-line operation |
| `apolloSandbox.defaultVariables` | `{}` | JSON variables |
| `apolloSandbox.headerDetectMs` | `6000` | Listen + probe timeout (ms) |
| `apolloSandbox.sandboxWaitMs` | `9000` | Wait after iframe reload (ms) |

## How it works

Apollo Sandbox runs in a cross-origin iframe. This extension:

1. **Auto-detects** headers from live traffic, browser storage, and endpoint probes
2. **Rebuilds** the embed URL with Apollo's `document`, `variables`, and `headers` params
3. **Relays** Sandbox Run via `postMessage` on the parent page (`credentials: include` for cookies)

## License

MIT
