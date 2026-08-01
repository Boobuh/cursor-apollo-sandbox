#!/usr/bin/env bash
# Create GitHub branch ruleset on main (matches Settings → Rules → New branch ruleset UI).
# Requires: gh auth login (repo admin) OR GH_TOKEN with admin:repo scope.
set -euo pipefail

REPO="${GITHUB_REPO:-Boobuh/cursor-apollo-sandbox}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if ! command -v gh >/dev/null 2>&1; then
  echo "Install GitHub CLI: https://cli.github.com/"
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "Run: gh auth login"
  echo "Then re-run: $0"
  exit 1
fi

existing="$(gh api "/repos/${REPO}/rulesets" --jq '.[].name' 2>/dev/null | grep -Fx 'Protect main' || true)"
if [[ -n "$existing" ]]; then
  echo "Ruleset 'Protect main' already exists on ${REPO}."
  exit 0
fi

echo "Creating branch ruleset on ${REPO}…"
gh api \
  --method POST \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "/repos/${REPO}/rulesets" \
  --input "${SCRIPT_DIR}/ruleset-protect-main.json"

echo ""
echo "Done — same as GitHub UI rules/new?target=branch:"
echo "  - Target: main"
echo "  - Require PR + 1 approval + CODEOWNERS (@Boobuh)"
echo "  - Dismiss stale reviews; require last-push approval"
echo "  - Require resolved conversations"
echo "  - Block force pushes"
echo ""
echo "Contributors fork → PR. Only you approve & merge."
