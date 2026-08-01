# Branch ruleset — fill on this page

Open: https://github.com/Boobuh/cursor-apollo-sandbox/settings/rules/new?target=branch

## Fields (match `scripts/ruleset-protect-main.json`)

| Section | Value |
|---------|--------|
| **Ruleset name** | `Protect main` |
| **Enforcement** | **Active** |
| **Bypass list** | *(leave empty — no bypass)* |
| **Target → Add target** | **Include by pattern** → `main` *(or “Include default branch”)* |

## Rules → Add rule

### 1. Require a pull request before merging

- **Required approvals:** `1`
- **Dismiss stale reviews:** on
- **Require review from Code Owners:** on *(uses `.github/CODEOWNERS` → @Boobuh)*
- **Require approval of the most recent reviewable push:** on
- **Require conversation resolution:** on

### 2. Block force pushes

Add rule → **Block force pushes**

## Save

Click **Create** (bottom).

---

**CLI equivalent** (after `gh auth login`):

```bash
./scripts/setup-branch-protection.sh
```
