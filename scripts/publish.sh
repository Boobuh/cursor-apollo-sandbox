#!/usr/bin/env bash
# Publish cursor-apollo-sandbox to the Visual Studio Marketplace (Cursor uses this registry).
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -f .env ]]; then
  # shellcheck disable=SC1091
  set -a && source .env && set +a
fi

PUBLISHER="${VSCE_PUBLISHER:-boobuh}"

if ! command -v vsce >/dev/null 2>&1 && ! npx --yes @vscode/vsce --version >/dev/null 2>&1; then
  echo "Installing @vscode/vsce…"
  npm install
fi

VSCE=(npx @vscode/vsce)

echo "Building…"
npm run build

echo "Packaging VSIX…"
"${VSCE[@]}" package --no-dependencies

VSIX=(cursor-apollo-sandbox-*.vsix)
echo "Created: ${VSIX[0]}"

if [[ "${1:-}" == "--package-only" ]]; then
  echo "Done (package only)."
  exit 0
fi

if [[ -z "${VSCE_PAT:-}" ]]; then
  echo ""
  echo "To publish:"
  echo "  1. Create publisher: https://marketplace.visualstudio.com/manage/createpublisher"
  echo "     Publisher ID must be: ${PUBLISHER}"
  echo "  2. Create PAT (Marketplace → Manage): https://dev.azure.com/_users/settings/tokens"
  echo "  3. Run:"
  echo "       npx @vscode/vsce login ${PUBLISHER}"
  echo "       VSCE_PAT=*** npm run publish:marketplace"
  echo "     Or: VSCE_PAT=*** ./scripts/publish.sh --publish"
  exit 0
fi

if [[ "${1:-}" == "--publish" ]] || [[ -n "${VSCE_PAT:-}" ]]; then
  echo "Publishing to Visual Studio Marketplace…"
  "${VSCE[@]}" publish --no-dependencies -p "${VSCE_PAT}"
  echo "Done: https://marketplace.visualstudio.com/items?itemName=${PUBLISHER}.cursor-apollo-sandbox"
fi
