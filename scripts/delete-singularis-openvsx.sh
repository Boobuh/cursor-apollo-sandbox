#!/usr/bin/env bash
# Remove Singularis.singularis from Open VSX (Cursor marketplace source).
# Requires: logged in at https://open-vsx.org with GitHub (Boobuh account).
set -euo pipefail

echo "Remove Singularis.singularis from Open VSX"
echo "========================================="
echo ""
echo "Open VSX search for 'boobuh' already excludes Singularis (v0.0.4+)."
echo "If Cursor still shows the old listing, delete all versions here:"
echo ""
echo "  1. Open https://open-vsx.org (Sign in with GitHub if needed)"
echo "  2. Profile (top right) → Settings → Extensions"
echo "  3. Find 'singularis' under publisher Singularis"
echo "  4. Trash icon → select ALL versions (0.0.1 … 0.0.4) → Delete"
echo "  5. Restart Cursor (or Developer: Reload Window) to refresh marketplace cache"
echo ""

if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "https://open-vsx.org/" 2>/dev/null || true
elif command -v open >/dev/null 2>&1; then
  open "https://open-vsx.org/" 2>/dev/null || true
fi
