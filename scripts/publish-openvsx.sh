#!/usr/bin/env bash
# Publish cursor-apollo-sandbox to Open VSX (Cursor extension search).
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -f .env ]]; then
  # shellcheck disable=SC1091
  set -a && source .env && set +a
fi

PUBLISHER="${OVSX_PUBLISHER:-boobuh}"
VERSION="$(node -p "require('./package.json').version")"
VSIX="${1:-cursor-apollo-sandbox-${VERSION}.vsix}"

if [[ ! -f "$VSIX" ]]; then
  echo "VSIX not found: $VSIX — run: npm run package"
  exit 1
fi

if [[ -z "${OVSX_PAT:-}" ]]; then
  echo "Set OVSX_PAT (token from https://open-vsx.org/user-settings/tokens)"
  exit 1
fi

echo "Creating namespace ${PUBLISHER} (ok if it already exists)…"
npx ovsx create-namespace "$PUBLISHER" -p "$OVSX_PAT" || true

echo "Publishing ${VSIX}…"
npx ovsx publish "$VSIX" -p "$OVSX_PAT"

echo "Done: https://open-vsx.org/extension/${PUBLISHER}/cursor-apollo-sandbox"
