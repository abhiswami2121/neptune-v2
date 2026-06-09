---
name: code-self-review
description: Before every commit: run linter, type check, scan for secrets, check for console.log, and verify no oversized files. Self-review your own code like a reviewer would. Triggers on "self-review", "review my code", "check before commit", "pre-commit check", "code quality", "lint", "type check", "clean up code".
---

You review your own code before every commit. You are your own first reviewer — catch issues before anyone else sees them.

## Self-Review Checklist

Run ALL of these before committing ANY code:

### 1. Linter Check
```bash
pnpm lint
```
- Fix ALL lint errors. Most are auto-fixable with `pnpm lint --fix`.
- If a lint rule conflicts with intent: add a targeted disable comment with explanation, not file-wide.

### 2. Type Check
```bash
pnpm typecheck || pnpm tsc --noEmit
```
- Zero tolerance for type errors. Every `any` must be justified.
- Check that you're using the right types from shared libs, not reinventing them.

### 3. Secret and Sensitive Data Scan
Search changed files for:
- API keys (`sk-*`, `pk_*`, `ghp_*`, `github_pat_*`)
- Tokens (`token`, `secret`, `password`, `api_key`, `API_KEY`)
- Connection strings (`postgres://`, `mongodb://`, `redis://`)
- Private keys (`-----BEGIN`, `PRIVATE KEY`)
- Internal URLs that shouldn't be public
- Personal email addresses or phone numbers

If ANY found: REMOVE them. Use environment variables. Never commit secrets.

### 4. Console Log Cleanup
```bash
grep -rn "console\.\(log\|warn\|debug\)" <changed_files>
```
- Remove ALL `console.log` and `console.debug` statements
- `console.error` is acceptable ONLY in catch blocks and error handlers
- `console.warn` is acceptable for deprecation notices
- Remove `debugger;` statements

### 5. Dead Code Removal
- Remove commented-out code blocks longer than 3 lines
- Remove unused imports (most editors flag these)
- Remove unused variables and functions
- If you need to preserve code for later, use a TODO comment with a ticket reference

### 6. File Size Check
- Components over 300 lines: consider splitting
- Functions over 50 lines: consider extracting
- Files over 500 lines: strong candidate for refactoring
- Check that you haven't accidentally committed build artifacts or node_modules

### 7. Import Hygiene
- No circular imports
- No relative imports that go up more than 3 levels (`../../../`)
- Use path aliases (`@/components/...`) instead of deep relative paths
- No barrel imports that pull in entire libraries

### 8. Error Handling Check
- Every async operation has error handling (try/catch or `.catch()`)
- Every API route has proper error responses (not just 500)
- Error messages don't leak internal details to users
- User-facing errors are helpful and actionable

### 9. Accessibility Quick Check
- All images have `alt` text
- All form inputs have labels (or aria-label/labelledby)
- Interactive elements are keyboard accessible
- Color is not the only way to convey information

### 10. Performance Quick Check
- No synchronous blocking operations on the main thread
- No unnecessary re-renders in React components
- Data fetching uses appropriate caching strategy
- Large lists use virtualization if needed

## Pass/Fail Decision

| Criterion | Pass Threshold |
|-----------|---------------|
| Linter | 0 errors |
| Type check | 0 errors |
| Secrets | 0 found |
| Console.log | 0 in production code |
| Dead code | No blocks > 10 lines |
| File size | No files > 500 lines |
| Imports | No circular, no deep relatives |
| Error handling | All async handled |

**Result**: All 8 criteria must pass. Any failure = do NOT commit until fixed.
