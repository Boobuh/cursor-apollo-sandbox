#!/usr/bin/env bash
# Publish Singularis namespace bootstrap extension to Open VSX.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PUBLISHER="Singularis"
VERSION="$(node -p "require('./package.json').version")"
VSIX="${1:-singularis-${VERSION}.vsix}"

if [[ -f "$ROOT/../../.env" ]]; then
  # shellcheck disable=SC1091
  set -a && source "$ROOT/../../.env" && set +a
fi

if [[ ! -f "$VSIX" ]]; then
  echo "VSIX not found: $VSIX — run: npm run package"
  exit 1
fi

if [[ -z "${OVSX_PAT:-}" ]]; then
  echo "Set OVSX_PAT (https://open-vsx.org/user-settings/tokens)"
  exit 1
fi

echo "Creating namespace ${PUBLISHER}…"
npx ovsx create-namespace "$PUBLISHER" -p "$OVSX_PAT" || true

echo "Publishing ${VSIX}…"
npx ovsx publish "$VSIX" -p "$OVSX_PAT"

echo "Done: https://open-vsx.org/extension/${PUBLISHER}/singularis"
