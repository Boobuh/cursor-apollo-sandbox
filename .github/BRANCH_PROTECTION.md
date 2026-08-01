# Enable branch protection (one-time, repo admin)

Repo files are already on `main` (CODEOWNERS, CONTRIBUTING, PR template).

## Option A — CLI (fastest)

```bash
gh auth login
cd /path/to/cursor-apollo-sandbox
./scripts/setup-branch-protection.sh
```

## Option B — GitHub UI

1. Open [Settings → Branches](https://github.com/Boobuh/cursor-apollo-sandbox/settings/branches)
2. **Add branch ruleset** or **Add classic rule** for `main`
3. Enable:
   - **Require a pull request before merging**
   - **Require approvals** → **1**
   - **Require review from Code Owners**
   - **Require conversation resolution before merging**
   - **Do not allow bypassing the above settings** (including admins)
   - **Block force pushes**
4. Save

## How contributions work after this

| Role | Can fork | Can open PR | Can approve | Can merge to main |
|------|----------|-------------|-------------|-------------------|
| Anyone | yes | yes | no | no |
| You (@Boobuh) | yes | yes | yes | yes |

Do **not** add collaborators with **Write** unless you trust them to merge. **Read** or fork-only is enough for external contributors.
