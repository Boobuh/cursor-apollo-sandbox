# Cursor Apollo Sandbox

Fill **Apollo Server Sandbox** inside [Cursor](https://cursor.com)'s embedded browser — formatted GraphQL operation, pretty JSON variables, and auth headers. No Chrome, no CDP patches, no restart.

## Requirements

- **Cursor** with embedded Browser tab (uses built-in `cursor.browserView.*` commands)
- Logged into your app in the Cursor browser (session that sends Bearer tokens to `/graphql`)

## Install (from source)

```bash
git clone https://github.com/Boobuh/cursor-apollo-sandbox.git
cd cursor-apollo-sandbox
npm install
npm run build
```

In Cursor: **Extensions** → **…** → **Install from VSIX…**  
Or: **Developer: Install Extension from Location…** → select this folder.

For local dev: symlink into extensions and rebuild after changes:

```bash
ln -s "$(pwd)" ~/.cursor/extensions/cursor-apollo-sandbox
npm run build
```

Reload Cursor window.

Configure **Settings → Apollo Sandbox** (`apolloSandbox.catalogUrl`, `apolloSandbox.graphqlUrl`) before first use.

## Commands

| Command | What it does |
| -------- | ------------- |
| **Apollo Sandbox: Setup Sandbox (auth + fill)** | Capture Bearer from catalog page → open GraphQL → fill Sandbox |
| **Apollo Sandbox: Capture Auth** | Hook fetch/XHR on catalog page → `sessionStorage.__apolloAuth` |
| **Apollo Sandbox: Fill Sandbox** | Reload Sandbox iframe with operation + variables + headers |
| **Apollo Sandbox: Run Operation (parent fetch)** | POST query via parent page (bypasses iframe) |
| **Apollo Sandbox: Open GraphQL Endpoint** | Open configured GraphQL URL in browser tab |

Open Command Palette (`Ctrl+Shift+P`) and search **Apollo Sandbox**.

## Settings

| Key | Default | Description |
| ----- | -------- | ------------- |
| `apolloSandbox.catalogUrl` | *(empty)* | App page used to capture Bearer token (must trigger `/graphql` while logged in) |
| `apolloSandbox.graphqlUrl` | `http://localhost:4000/graphql` | Apollo Server landing page / GraphQL endpoint URL |
| `apolloSandbox.sandboxWaitMs` | `9000` | Milliseconds to wait after reloading the Sandbox iframe |

## How it works

Apollo Sandbox runs in a cross-origin iframe. Instead of CDP inside the iframe, this extension:

1. Captures `Authorization` and optional custom headers from live `/graphql` traffic
2. Rebuilds the embed iframe URL with `document`, `variables`, and `headers` query params (Apollo documented API)
3. Installs a lightweight `postMessage` relay so **Run** in Sandbox can reach your API with auth

Operation and variables are always **pretty-formatted** (multi-line GraphQL + 2-space JSON).

## Customize for your API

Edit `src/apollo/export-template.ts` — change `DEFAULT_OPERATION`, `DEFAULT_VARIABLES`, and header keys in `buildCaptureAuthScript` / `buildSandboxIframeUrl` as needed.

## License

MIT
