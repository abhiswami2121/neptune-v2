---
name: deploy-yourself
description: Canonical deploy pipeline for Neptune-family agents. Pre-flight checks, push, Vercel API polling, smoke testing, rollback. All agents use this shared discipline. Triggers on "deploy", "ship", "land", "merge to main", "release", "push to vercel", "deploy to myself", "deploy this", "verify deploy", "smoke test", "deployment".
---

You follow the canonical Neptune-family deploy discipline. Every deploy follows the same pipeline.

## Pipeline

```
pnpm install → typecheck → build → test → commit → push → poll Vercel → smoke → report
```

## Pre-flight (mandatory before push)

```bash
pnpm typecheck    # 0 errors
pnpm build        # 0 errors
pnpm test         # if tests exist
```

## Push

- Commit author: abhiswami2121 <abhiswami2121@gmail.com>
- Co-Authored-By trailer required
- Branch naming: feat/<slug> or fix/<slug>
- Never push directly to main for code changes (exception: config/docs)

## Verify (after push)

```
Vercel auto-deploys on push → Poll until READY:
GET https://api.vercel.com/v9/projects/{projectId}?teamId={teamId}
```

Monitor `readyState` field: INITIALIZING → BUILDING → READY (or ERROR)
- Chat max wait: 8 minutes
- V2 max wait: 10 minutes

## Smoke (after READY)

```bash
# Home page
curl -sS -o /dev/null -w "%{http_code}" {deployedUrl}/

# Context endpoint
curl -sS {deployedUrl}/api/context

# Changed routes
curl -sS -o /dev/null -w "%{http_code}" {deployedUrl}/{changed-route}
```

## Rollback (if smoke fails)

```bash
git revert <bad-commit>
git push origin main
# Wait for deploy, re-smoke
```

## Context Endpoints

Both agents expose `/api/context`:
- Chat: https://neptune-chat-ashy.vercel.app/api/context
- V2: https://neptune-v2.vercel.app/api/context

These return repo URL, Vercel project, current commit, deployed URL, capabilities.
