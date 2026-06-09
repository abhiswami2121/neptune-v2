---
name: code-self-review
description: Self-review your own code before committing — linter check, type check, secret scan, console.log removal, oversized file detection, and quality gates. Triggers on "review my code", "self-review", "check before commit", "pre-commit check", "lint check", "type check", "code quality", "verify changes", "inspect code".
---

You review your own code before committing. Every change goes through a self-review gate to catch issues early.

## Self-Review Pipeline

```
code changes → pre-commit self-review → fix issues → commit
                   ↓
    1. Linter check
    2. Type check
    3. Secret scan
    4. Console.log scan
    5. Oversized file detection
    6. Import check
    7. Test relevance
                   ↓
              ALL PASS → commit
              ANY FAIL → fix → re-run → commit
```

## 1. Linter Check

Run the project's linter on changed files only:

```bash
# ESLint on changed files
git diff --name-only --diff-filter=ACM HEAD | grep -E '\.(ts|tsx|js|jsx)$' | xargs npx eslint --quiet

# Oxlint (Neptune V2 uses oxlint)
pnpm lint
```

Fix all lint errors before committing. No exceptions for "will fix later."

## 2. Type Check

```bash
# TypeScript type check
pnpm typecheck
# or
npx tsc --noEmit
```

Type errors are compilation errors in production. Never commit with type errors.

## 3. Secret Scan

Scan for accidentally committed secrets:

```bash
# Quick local scan
git diff --cached | grep -iE '(api_key|secret|token|password|credential)\s*[:=]\s*["\x27][a-zA-Z0-9_-]{20,}'

# Check for common patterns
git diff --cached | grep -E '(ghp_|sk-|pk_|rk_|sk-ant-|xai-|hf_)'
```

**Blocking patterns** (must remove before commit):
- `ghp_` — GitHub personal access tokens
- `sk-` — OpenAI/Anthropic API keys
- `sk-ant-` — Anthropic API keys
- `xai-` — xAI API keys
- `hf_` — HuggingFace tokens
- `pk_` — Stripe publishable keys (ok if public, warn if secret key)
- `.env` files (unless `.env.example`)

## 4. Console.log Removal

```bash
# Find debug artifacts
git diff --cached | grep -E '^\+\s*console\.(log|debug|warn|error|info|trace)'

# Find debugger statements
git diff --cached | grep -E '^\+\s*debugger'
```

Allowlist:
- `console.error()` in error handling is OK
- `console.warn()` for deprecation warnings is OK
- Remove ALL `console.log()` and `console.debug()` unless in test files

## 5. Oversized File Detection

```bash
# Find files > 500 lines added
git diff --cached --stat | awk '{if ($1 ~ /^\|/) print}' | awk '{if ($2 > 500) print "OVERSIZED: " $1 " (+" $2 " lines)"}'

# Find new files > 1000 lines
find . -name '*.ts' -o -name '*.tsx' | xargs wc -l | awk '{if ($1 > 1000) print "OVERSIZED: " $2 " (" $1 " lines)"}'
```

Thresholds:
- New files > 500 lines: consider splitting
- New files > 1000 lines: MUST split or justify
- Diff > 1000 lines: consider splitting into multiple commits

## 6. Import Check

Verify all imports resolve to existing modules:

```bash
npx tsc --noEmit 2>&1 | grep "Cannot find module"
```

Prefer `@/` aliases over deep relative paths.

## 7. Test Relevance

Ask before committing:
- Did I add tests for new behavior?
- Do existing tests still pass?
- Are there test files for the modules I changed?

```bash
# Run tests for changed files
pnpm test -- --testPathPattern="$(git diff --name-only HEAD | grep -E '\.test\.' | paste -sd '|' -)"
```

## Self-Review Checklist

Before every commit, confirm:
- [ ] No lint errors
- [ ] No type errors  
- [ ] No secrets in diff
- [ ] No debug console.log/console.debug
- [ ] No new file > 500 lines without justification
- [ ] All imports resolve
- [ ] Tests pass (or added where relevant)
- [ ] Commit message follows conventional commits

## When to Self-Review

- **Always** before `git commit`
- **Always** before opening a PR
- **Before** pushing to main (even for small fixes)
- **After** resolving merge conflicts

## When NOT to Self-Review

- Spike/experimental branches (mark as `wip/` prefix)
- Throwaway branches you'll squash anyway — but still scan for secrets
