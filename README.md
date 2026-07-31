# Cursor Apollo Sandbox

Fill **Apollo Server Sandbox** inside [Cursor](https://cursor.com)'s embedded browser for **any Apollo GraphQL project** — formatted operation, pretty JSON variables, and request headers (Bearer, API keys, or custom). No Chrome, no CDP patches, no restart.

Works with Apollo Server 4/5 Sandbox (`#embeddableSandbox`), cookie sessions, and bearer-token APIs.

## Requirements

- **Cursor** with embedded Browser tab (`cursor.browserView.*` commands)
- An Apollo Server GraphQL endpoint (local or remote)
- Optional: a logged-in frontend page that calls your API (to capture auth headers)

## Install

```bash
git clone https://github.com/Boobuh/cursor-apollo-sandbox.git
cd cursor-apollo-sandbox
npm install
npm run build
ln -s "$(pwd)" ~/.cursor/extensions/cursor-apollo-sandbox
```

Reload Cursor. Configure **Settings → Apollo Sandbox**.

## Quick start

1. Set `apolloSandbox.graphqlUrl` to your Apollo Sandbox URL (e.g. `http://localhost:4000/graphql`).
2. Set `apolloSandbox.defaultOperation` / `defaultVariables` for the query you want to run.
3. If your API needs headers: set `authCaptureUrl` to a page that triggers GraphQL while logged in, then run **Capture Auth Headers**.
4. Run **Setup (capture auth + fill)** or **Fill Sandbox** on the GraphQL page.

Public APIs with no extra headers: skip capture and use **Fill Sandbox** directly.

## Commands

| Command | What it does |
| -------- | ------------- |
| **Setup (capture auth + fill)** | Capture headers from app traffic → open GraphQL → fill Sandbox |
| **Capture Auth Headers** | Hook fetch/XHR → store all GraphQL request headers in `sessionStorage` |
| **Fill Sandbox** | Reload Sandbox iframe with operation + variables + headers |
| **Run Operation (parent fetch)** | POST the configured operation via the parent page |
| **Open GraphQL Endpoint** | Open `graphqlUrl` in a browser tab |

Command Palette → **Apollo Sandbox**.

## Settings

| Key | Default | Description |
| ----- | -------- | ------------- |
| `apolloSandbox.graphqlUrl` | `http://localhost:4000/graphql` | Apollo Server Sandbox / GraphQL endpoint |
| `apolloSandbox.authCaptureUrl` | *(empty)* | Page that sends GraphQL while logged in; falls back to `graphqlUrl` |
| `apolloSandbox.graphqlUrlMatch` | *(auto)* | URL substring to detect GraphQL traffic (default: pathname of `graphqlUrl`) |
| `apolloSandbox.defaultOperation` | `query ExampleQuery { __typename }` | Multi-line operation for Sandbox |
| `apolloSandbox.defaultVariables` | `{}` | JSON object for variables panel |
| `apolloSandbox.sandboxWaitMs` | `9000` | Wait after iframe reload (ms) |

## How it works

Apollo Sandbox runs in a cross-origin iframe. This extension avoids iframe CDP by:

1. **Capturing** all non-hop headers from live GraphQL `fetch`/XHR (Authorization, `x-api-key`, custom headers — whatever your API uses)
2. **Rebuilding** the embed URL with Apollo's `document`, `variables`, and `headers` query params
3. **Relaying** Sandbox Run requests via `postMessage` on the parent page (with `credentials: include` for cookie auth)

Operation and variables are always **pretty-formatted** (multi-line GraphQL + 2-space JSON).

## Examples

**Local Apollo Server (no auth)**

```json
{
  "apolloSandbox.graphqlUrl": "http://localhost:4000/graphql",
  "apolloSandbox.defaultOperation": "query { __typename }"
}
```

**Bearer token from a SPA**

```json
{
  "apolloSandbox.graphqlUrl": "https://api.example.com/graphql",
  "apolloSandbox.authCaptureUrl": "https://app.example.com/dashboard",
  "apolloSandbox.defaultOperation": "query Me { me { id email } }"
}
```

## License

MIT
