---
name: git-flow-discipline
description: Branch naming conventions, commit message format, when to squash, and conflict resolution strategies. Triggers on "git", "branch", "commit", "PR", "pull request", "merge", "squash", "rebase", "conflict", "feature branch", "branch name", "git flow", "branching".
---

You are a disciplined Git practitioner. Every code change follows a consistent branching and commit workflow.

## Branch Naming Convention

Always create a feature branch from `main` before making changes:

```
feature/<task-slug>        # New features
fix/<bug-description>      # Bug fixes  
refactor/<scope>           # Code refactoring
docs/<what>                # Documentation only
chore/<task>               # Build, deps, config
```

Rules:
- Use lowercase kebab-case
- Keep it under 50 characters
- Prefix with the appropriate type
- Never commit directly to `main`
- Delete local and remote branches after merge

## Commit Message Format

Follow Conventional Commits specification:

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

Types: `feat`, `fix`, `refactor`, `docs`, `chore`, `test`, `style`, `perf`
Scope: the module or component being changed (e.g., `chat`, `sandbox`, `deploy`)

Examples:
```
feat(chat): add streaming response support
fix(sandbox): resolve file path escaping on Windows
refactor(deploy): extract Vercel helper to shared lib
```

Rules:
- Subject line: imperative mood, max 72 chars, no period at end
- Separate subject from body with blank line
- Reference issues in footer: `Refs: #123`

## When to Squash vs Merge

**Squash and merge** when:
- Feature branch has many WIP/experimental commits
- The branch tells a messy story that doesn't need to be preserved
- You're merging a single logical change

**Merge commit** when:
- Branch has distinct, well-documented commits that tell a useful history
- Multiple developers contributed
- You need to preserve the branch topology

**Rebase and merge** when:
- Linear history is required by project convention
- Branch is clean and each commit stands alone

## Conflict Resolution Strategy

1. **Before creating PR**: `git fetch origin && git rebase origin/main`
2. **When conflicts occur**:
   - Read the conflicting files carefully to understand both changes
   - Prefer the more recent change if they're equivalent
   - If semantic conflict: combine both changes thoughtfully
   - After resolving: `git add <files>` then `git rebase --continue`
3. **Never force-push to shared branches** without team coordination
4. **If a PR has conflicts**: resolve by rebasing onto main, don't create merge commits in feature branches

## Branch Cleanup

After merge to main:
```bash
git checkout main
git pull origin main
git branch -d feature/<slug>        # delete local
git push origin --delete feature/<slug>  # delete remote
```

Run cleanup periodically to remove stale branches older than 30 days.

## Security: Never Commit

- `.env` files or any file containing secrets
- `node_modules/` directories
- Build artifacts (`dist/`, `.next/`, `build/`)
- Large binary files (>5MB) without Git LFS
- IDE-specific config files (`.vscode/`, `.idea/`) unless in `.gitignore`
