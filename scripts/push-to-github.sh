#!/usr/bin/env bash
# Create GitHub repo and push (requires: gh auth login once).
set -euo pipefail
cd "$(dirname "$0")/.."

if ! gh auth status >/dev/null 2>&1; then
  echo "Run: gh auth login"
  echo "Then re-run this script."
  exit 1
fi

gh repo create cursor-apollo-sandbox --public --source=. --remote=origin --push
echo "Done: https://github.com/$(gh api user -q .login)/cursor-apollo-sandbox"
