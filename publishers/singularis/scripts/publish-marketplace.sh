#!/usr/bin/env bash
# Publish Singularis bootstrap extension to Visual Studio Marketplace.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PUBLISHER="Singularis"

if [[ -f "$ROOT/../../.env" ]]; then
  # shellcheck disable=SC1091
  set -a && source "$ROOT/../../.env" && set +a
fi

if ! command -v vsce >/dev/null 2>&1; then
  npm install
fi

VSCE=(npx @vscode/vsce)

echo "Packaging Singularis bootstrap VSIX…"
"${VSCE[@]}" package --no-dependencies

VSIX=(singularis-*.vsix)
echo "Created: ${VSIX[0]}"

if [[ "${1:-}" == "--package-only" ]]; then
  exit 0
fi

if [[ -z "${VSCE_PAT:-}" ]]; then
  echo ""
  echo "Create publisher Singularis: https://marketplace.visualstudio.com/manage/createpublisher"
  echo "Then: VSCE_PAT=*** $0 --publish"
  exit 0
fi

echo "Publishing to Visual Studio Marketplace…"
"${VSCE[@]}" publish --no-dependencies -p "${VSCE_PAT}"
echo "Done: https://marketplace.visualstudio.com/items?itemName=${PUBLISHER}.singularis"
