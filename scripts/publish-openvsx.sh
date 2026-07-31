#!/usr/bin/env bash
# Publish cursor-apollo-sandbox to Open VSX (Cursor extension search).
set -euo pipefail
cd "$(dirname "$0")/.."

PUBLISHER="${OVSX_PUBLISHER:-boobuh}"
VSIX="${1:-cursor-apollo-sandbox-0.3.1.vsix}"

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
