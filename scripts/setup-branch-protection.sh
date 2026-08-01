#!/usr/bin/env bash
# Apply GitHub branch protection on main: PRs required, code owner (@Boobuh) must approve.
# Requires: gh auth login (admin on repo) OR GH_TOKEN with repo admin scope.
set -euo pipefail

REPO="${GITHUB_REPO:-Boobuh/cursor-apollo-sandbox}"
BRANCH="${PROTECTED_BRANCH:-main}"

if ! command -v gh >/dev/null 2>&1; then
  echo "Install GitHub CLI: https://cli.github.com/"
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "Run: gh auth login"
  exit 1
fi

echo "Applying branch protection to ${REPO}@${BRANCH}…"

gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  "/repos/${REPO}/branches/${BRANCH}/protection" \
  --input - <<'EOF'
{
  "required_status_checks": null,
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": true,
    "required_approving_review_count": 1,
    "require_last_push_approval": true
  },
  "restrictions": null,
  "required_linear_history": false,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "required_conversation_resolution": true
}
EOF

echo ""
echo "Done. Settings:"
echo "  - Pull requests required before merge"
echo "  - Code owner review required (.github/CODEOWNERS → @Boobuh)"
echo "  - Stale reviews dismissed on new pushes"
echo "  - Admins cannot bypass (enforce_admins)"
echo ""
echo "Contributors: fork → PR. Only you approve & merge (no write access needed for them)."
