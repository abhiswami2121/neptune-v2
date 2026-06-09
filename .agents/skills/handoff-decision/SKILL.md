---
name: handoff-decision
description: Determine whether V2 should handle a task inline or hand it off to the VPS Hermes agent. Triggers on "handoff", "VPS", "long running", "multi-repo", "system level", "cron", "pm2", "env vars", "offload", "delegate to VPS", "too big", "heavy compute".
---

You make intelligent handoff decisions. Not every task should run in V2's sandbox. Some work belongs on the VPS. You know the difference.

## Decision Framework

Before starting any task, classify it against this matrix:

### HANDLE INLINE (V2 Sandbox)
V2 handles it directly when:
- **Single-repo coding** of any size: features, refactors, bug fixes
- **New feature implementation**: pages, components, API routes, libraries
- **UI changes**: layout, styling, Tailwind, shadcn/ui, animations
- **API endpoint additions**: new routes, handler logic
- **Test writing**: unit, integration, component tests
- **Documentation updates**: README, inline docs, comments
- **Dependency updates**: adding/updating npm packages
- **Code generation**: scaffolding, boilerplate, templates
- **PR creation and review**: within a single repo
- **Estimated runtime < 15 minutes**

### HAND OFF TO VPS (Hermes Agent)
Route to VPS via `vps-bridge.ts` when:
- **Long-running computation** (> 30 minutes estimated): large refactors, cross-codebase migrations, batch operations
- **Multi-repo changes** (3+ repositories): coordinated changes across neptune-v2, neptune-chat, landing pages, etc.
- **System-level operations**: pm2 restart/reload, cron job creation/editing, systemd service changes
- **Environment variable rotation**: changing secrets across all Vercel projects
- **Heavy data analysis**: processing > 10K records, database migrations with verification
- **VPS filesystem access**: anything outside V2's sandbox scope (e.g., /home/neptune/, /etc/)
- **Long-running cron jobs**: scheduled tasks that run for hours
- **Database administration**: Postgres schema changes that require superuser access
- **SSL certificate management**: or any DNS-level changes
- **Estimated runtime > 30 minutes**

### AMBIGUOUS CASES

When in doubt, ask these questions:

1. **Will this take more than 30 minutes of execution time?**
   - Yes → Hand off to VPS
   - No → Handle inline

2. **Does this touch more than 2 repositories?**
   - Yes → Hand off to VPS
   - No → Handle inline

3. **Does this require filesystem access outside the sandbox?**
   - Yes → Hand off to VPS
   - No → Handle inline

4. **Does this modify system configuration (pm2, cron, nginx, env)?**
   - Yes → Hand off to VPS
   - No → Handle inline

## Handoff Protocol

When handing off to VPS:
1. Call `hybridDispatch` via `vps-bridge.ts` with:
   - `mission`: clear description of what VPS should do
   - `repo`: target repository (or null for system-level)
   - `estimatedDuration`: expected runtime
   - `successCriteria`: how to verify completion
2. Include all context VPS needs (no "figure it out from cortex")
3. Pass the current session context so VPS can return results
4. Set a callback or polling mechanism for completion notification

## Examples

| Task | Decision | Reason |
|------|----------|--------|
| "Add a settings page" | INLINE | Single-repo feature, < 30 min |
| "Refactor all error handling across neptune-v2 + neptune-chat + landing" | VPS | Multi-repo (3+) |
| "Update 15 npm dependencies" | INLINE | Single-repo, sandbox can handle |
| "Rotate all Vercel tokens across 5 projects" | VPS | System-level, multi-project |
| "Fix a bug in ChatMessage component" | INLINE | Single-repo, focused fix |
| "Run database migration on production Postgres" | VPS | DB admin, system-level |
| "Create a new API endpoint" | INLINE | Single-repo, routine |
| "Add a cron job to cleanup stale sessions" | VPS | Cron/system modification |
