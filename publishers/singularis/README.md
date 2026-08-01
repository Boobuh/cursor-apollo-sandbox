# Singularis publisher

Second VS Code / Open VSX publisher for extensions by **Boobuh**.
**Cursor Apollo Sandbox** stays under publisher **`boobuh`**.

| Publisher ID | Extensions |
| --- | --- |
| `boobuh` | [cursor-apollo-sandbox](../../) |
| `Singularis` | future extensions + this namespace bootstrap (v0.0.1) |

## One-time: Visual Studio Marketplace

1. Open [Create publisher](https://marketplace.visualstudio.com/manage/createpublisher)
2. **Publisher ID:** `Singularis` (must match `package.json`)
3. **Display name:** `Singularis`
4. Create a [Personal Access Token](https://dev.azure.com/_users/settings/tokens) (Marketplace → Manage)

```bash
cd publishers/singularis
npm install
npx @vscode/vsce login Singularis
VSCE_PAT=*** npm run publish:marketplace
```

## Open VSX

From repo root (loads `OVSX_PAT` from `.env` if present):

```bash
npm run publish:singularis:openvsx
```

Or from this directory:

```bash
OVSX_PAT=*** npm run publish:openvsx
```

Then claim ownership: [namespace request issue](https://github.com/EclipseFdn/open-vsx.org/issues/new?template=namespace_request.md) — title `Claiming namespace Singularis`.
See `tmp/docs/openvsx-claim-namespace-Singularis.md` in lkq-be for a copy-paste body (after first publish).

## Package only

```bash
npm run package
# → singularis-0.0.1.vsix
```
