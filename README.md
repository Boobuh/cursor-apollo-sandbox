# Cursor Apollo Sandbox

Fill **Apollo Server Sandbox** inside [Cursor](https://cursor.com)'s embedded browser — formatted GraphQL operation, pretty JSON variables, and LMS auth headers. No Chrome, no CDP patches, no restart.

Built from the workflow we verified for LKQ Academy (`exportScheduledCoursesUsingImportTemplate` on develop.uk).

## Requirements

- **Cursor** with embedded Browser tab (uses built-in `cursor.browserView.*` commands)
- Logged into your LMS in the Cursor browser (Auth0 session)

## Install (from source)

```bash
git clone https://github.com/Boobuh/cursor-apollo-sandbox.git
cd cursor-apollo-sandbox
npm install
npm run build
```

In Cursor: **Extensions** → **…** → **Install from VSIX…**  
Or: **Developer: Install Extension from Location…** → select this folder.

For local dev: add folder to **Extensions** via **Install from VSIX** after `npx @vscode/vsce package`, or symlink:

```bash
ln -s "$(pwd)" ~/.cursor/extensions/cursor-apollo-sandbox
npm run build
```

Reload Cursor window.

## Commands

| Command | What it does |
| -------- | ------------- |
| **Apollo Sandbox: Setup Export Template (auth + fill)** | Capture Bearer from LMS catalog → open GraphQL → fill Sandbox |
| **Apollo Sandbox: Capture LMS Auth** | Hook fetch/XHR on catalog page → `sessionStorage.__apolloAuth` |
| **Apollo Sandbox: Fill Export Template** | Reload Sandbox iframe with operation + variables + headers |
| **Apollo Sandbox: Run Export (parent fetch)** | POST mutation via parent page (fast, ~10s) |
| **Apollo Sandbox: Open GraphQL Endpoint** | Open configured GraphQL URL in browser tab |

Open Command Palette (`Ctrl+Shift+P`) and search **Apollo Sandbox**.

## Settings

| Key | Default |
| ----- | -------- |
| `apolloSandbox.lmsCatalogUrl` | `https://develop.uk.training.lkqacademy.com/en/courses/catalog/skills` |
| `apolloSandbox.graphqlUrl` | `https://develop.uk.training.lkqacademy.com/graphql` |
| `apolloSandbox.sandboxWaitMs` | `9000` |

## How it works

Apollo Sandbox runs in a cross-origin iframe. Instead of CDP inside the iframe, this extension:

1. Captures `Authorization` + `x-company-id` / `x-role-assignment-id` / `x-language-id` from live LMS `/graphql` traffic
2. Rebuilds the embed iframe URL with `document`, `variables`, and `headers` query params (Apollo documented API)
3. Installs a lightweight `postMessage` relay so **Run** in Sandbox can reach your API with auth

Operation and variables are always **pretty-formatted** (multi-line GraphQL + 2-space JSON).

## Customize for other mutations

Edit `src/apollo/export-template.ts` or fork and change `EXPORT_IMPORT_TEMPLATE_*` constants.

## License

MIT
