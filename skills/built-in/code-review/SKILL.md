---
name: code-review
description: Reviews code changes and provides actionable feedback. Use when the user asks to review a PR, diff, commit, or code changes. Triggers on /review, review this PR, review my changes, code review.
version: 1.0.0
---

# Code Review — Automated Code Review Engine

Reviews code changes and provides actionable feedback.

## When to Use

- Review pull requests
- Audit uncommitted changes
- Review specific commits
- Compare branches for review

## Review Modes

1. **No arguments (default)**: Review all uncommitted changes
   - `git diff` for unstaged changes
   - `git diff --cached` for staged changes

2. **Commit hash**: Review that specific commit
   - `git show $ARGUMENTS`

3. **Branch name**: Compare current branch to the specified branch
   - `git diff $ARGUMENTS...HEAD`

4. **PR URL or number**: Review the pull request
   - `gh pr view $ARGUMENTS`
   - `gh pr diff $ARGUMENTS`

## Review Checklist

- **Security**: SQL injection, XSS, exposed secrets, auth bypass
- **Performance**: N+1 queries, unnecessary re-renders, missing memoization
- **Correctness**: Logic errors, edge cases, off-by-one
- **Style**: Naming conventions, code organization, DRY violations
- **Testing**: Missing test coverage for critical paths

## Output Format

Each finding includes:
- **Severity**: critical, high, medium, low
- **File**: Path and line number
- **Issue**: What's wrong
- **Fix**: Suggested resolution
- **Code**: Diff snippet of the fix when applicable
