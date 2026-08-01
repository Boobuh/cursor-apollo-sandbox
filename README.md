<p align="center">
  <img src="media/icon.png" alt="Cursor Apollo Sandbox" width="128" />
</p>

<h1 align="center">Cursor Apollo Sandbox</h1>

<p align="center">
  Fill <strong>Apollo Server Sandbox</strong> in Cursor's embedded browser — operation, variables, and auto-detected auth headers.
</p>

<p align="center">
  <a href="https://github.com/Boobuh/cursor-apollo-sandbox"><img src="https://img.shields.io/github/stars/Boobuh/cursor-apollo-sandbox?style=social" alt="GitHub stars" /></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=boobuh.cursor-apollo-sandbox"><img src="https://img.shields.io/visual-studio-marketplace/v/boobuh.cursor-apollo-sandbox?label=Marketplace&color=1e1e2e" alt="Marketplace version" /></a>
  <a href="https://github.com/Boobuh/cursor-apollo-sandbox/blob/main/LICENSE"><img src="https://img.shields.io/github/license/Boobuh/cursor-apollo-sandbox" alt="License" /></a>
</p>

> **Cursor only** — uses `cursor.browserView.*` APIs. Does not run in VS Code.

## Contributing

Fork the repo and open a pull request — see [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md).  
Changes to `main` require **code owner approval** ([@Boobuh](https://github.com/Boobuh)).

## Install from Marketplace

Search **Cursor Apollo Sandbox** in Cursor Extensions, or:

```
ext install boobuh.cursor-apollo-sandbox
```

## Install from source

```bash
git clone https://github.com/Boobuh/cursor-apollo-sandbox.git
cd cursor-apollo-sandbox
npm install
npm run build
ln -s "$(pwd)" ~/.cursor/extensions/cursor-apollo-sandbox
```

Reload Cursor. Set `apolloSandbox.graphqlUrl` and your default operation.

## Publish (maintainers)

```bash
# One-time: create publisher "boobuh" at marketplace.visualstudio.com
npx @vscode/vsce login boobuh
npm run package              # creates .vsix
VSCE_PAT=*** npm run publish:marketplace
```

See `scripts/publish.sh` for details.

### Singularis (second publisher)

Future extensions can use publisher **`Singularis`**. Cursor Apollo Sandbox stays on **`boobuh`**.

```bash
cp .env.example .env   # add OVSX_PAT / VSCE_PAT
npm run publish:singularis:openvsx      # Open VSX namespace bootstrap
npm run publish:singularis:marketplace  # after creating publisher on Marketplace
```

Details: [`publishers/singularis/README.md`](publishers/singularis/README.md)

## Requirements

- **Cursor** with embedded Browser tab (`cursor.browserView.*` commands)
- An Apollo Server GraphQL endpoint (local or remote)
- Optional: a logged-in frontend tab on the same host (improves header detection)

## Quick start

1. Open your GraphQL endpoint in the Cursor browser (local or remote `/graphql`), or set `apolloSandbox.graphqlUrl`.
2. Optional: enable **`apolloSandbox.graphqlUrlFromBrowserTab`** to pick the endpoint from whichever GraphQL tab you have open (falls back to `graphqlUrl`).
3. Run **Apollo Sandbox: Setup (auto-detect + fill)**.

The extension discovers headers automatically — no manual copy/paste.

## Auto-detect headers

Before fill or run, the extension:

1. **Listens** for GraphQL `fetch`/XHR on open tabs (same host as `graphqlUrl` / `authCaptureUrl`)
2. **Scans** `localStorage` / `sessionStorage` for Bearer tokens and common custom headers (`x-company-id`, `x-tenant-id`, etc.)
3. **Probes** your endpoint with `{ __typename }` — tries cookie-only, then each candidate header set
4. **Persists** the working set to Sandbox + parent-page relay

Public cookie-only APIs: probe succeeds with `{}` headers. Bearer APIs: token picked up from traffic or storage.

## Commands

| Command                          | What it does                                                     |
| -------------------------------- | ---------------------------------------------------------------- |
| **Setup (auto-detect + fill)**   | Detect headers → fill Sandbox                                    |
| **Auto-detect Headers**          | Run detection only (shows sources: traffic, storage, probe)      |
| **Fill Sandbox**                 | Auto-detect → reload iframe with operation + variables + headers |
| **Run Operation (parent fetch)** | Auto-detect → POST configured operation                          |
| **Open GraphQL Endpoint**        | Open `graphqlUrl` in a browser tab                               |

Command Palette → **Apollo Sandbox**.

## Settings

| Key                              | Default                             | Description                                                                  |
| -------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------- |
| `apolloSandbox.graphqlUrl`       | `http://localhost:4000/graphql`     | Default GraphQL endpoint when no browser tab matches                         |
| `apolloSandbox.graphqlUrlFromBrowserTab` | `false`                     | Use `/graphql` URL from the active Cursor browser tab                        |
| `apolloSandbox.authCaptureUrl`   | _(empty)_                           | Extra page to scan (SPA dashboard); same host tabs are scanned automatically |
| `apolloSandbox.graphqlUrlMatch`  | _(auto)_                            | URL substring for GraphQL traffic                                            |
| `apolloSandbox.defaultOperation` | `query ExampleQuery { __typename }` | Multi-line operation                                                         |
| `apolloSandbox.defaultVariables` | `{}`                                | JSON variables                                                               |
| `apolloSandbox.headerDetectMs`   | `6000`                              | Listen + probe timeout (ms)                                                  |
| `apolloSandbox.sandboxWaitMs`    | `12000`                             | Max wait for Sandbox schema connection (green) before fill (ms)              |

## How it works

Apollo Sandbox runs in a cross-origin iframe. This extension:

1. **Auto-detects** headers from live GraphQL traffic on open app tabs
2. **Bootstraps** the embed (endpoint + headers only) and waits for schema connection (green status)
3. **Fills** operation + pretty-printed variables after introspection succeeds
4. **Relays** Sandbox requests via the official Apollo embed `postMessage` protocol on the parent page

### Embed postMessage protocol

The iframe speaks the same message names as `@apollo/sandbox` (embeddable-explorer):

| Inbound (iframe → parent) | Parent reply |
| --- | --- |
| `ExplorerListeningForHandshake` | `HandshakeResponse` |
| `IntrospectionQueryWithHeaders` | `SchemaResponse` or `SchemaError` |
| `ExplorerRequest` | `ExplorerResponse` |

Earlier builds used incorrect names (`QueryMutationRequest`, `IntrospectionQuery`) so introspection never completed and the status dot stayed red. v0.7+ implements the protocol above and is covered by unit tests in `test/sandbox-relay.test.mjs`.

Fill always completes even when the green wait times out — operation/variables are still applied.

### Cursor browser safety

Cursor browser tabs can be **agent-owned**; passing a tab `viewId` into `executeJavaScript` causes
`Browser view not found`. This extension **never** does that — it uses `selectTab` + active-view
commands only, with multi-step fallbacks (match URL → select → navigate → new tab).

## License

MIT
