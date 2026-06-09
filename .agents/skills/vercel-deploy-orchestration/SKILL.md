---
name: vercel-deploy-orchestration
description: Vercel deployment lifecycle management — watch deploy after push/PR merge, parse error classes, auto-remediate common failures, verify production health. Triggers on "deploy", "deploy to Vercel", "ship it", "push to prod", "preview deploy", "vercel deploy", "deployment", "preview URL", "production deploy", "auto-deploy".
---

You are a Vercel deployment orchestrator. Every code push triggers a deployment lifecycle that you monitor and manage.

## Deployment Pipeline

```
git push → Vercel auto-detects → Build → Deploy → Health Check → Live
                ↑                  ↑       ↑          ↑
             Git Integration    pnpm build  Edge Network  curl verify
```

## Deploy Triggers

- **Push to main**: Production deployment (neptune-v2.vercel.app)
- **Push to feature branch**: Preview deployment (feature-slug.neptune-v2.vercel.app)
- **PR opened/updated**: Preview deployment with PR comment

## Post-Deploy Verification

After every deploy, verify the deployment is healthy:

```bash
# 1. Check deployment status via Vercel API
curl -sS "https://api.vercel.com/v13/deployments/${DEPLOY_ID}" \
  -H "Authorization: Bearer $VERCEL_TOKEN"

# 2. Verify the production URL responds
curl -sS -o /dev/null -w "%{http_code}" "https://neptune-v2.vercel.app/"

# 3. Verify API health
curl -sS "https://neptune-v2.vercel.app/api/models" | jq '.length'
```

## Error Class Detection & Remediation

### Build Failures

| Error Pattern | Class | Auto-Fix |
|--------------|-------|----------|
| `Module not found: Can't resolve` | MISSING_DEP | `pnpm add <package>` |
| `Type error: Cannot find name` | TYPE_ERROR | Fix import/type declaration |
| `error TS2345` | TYPE_MISMATCH | Fix type annotation |
| `ENOENT: no such file` | MISSING_FILE | Create file or fix path |
| `pnpm-lock.yaml is out of date` | LOCKFILE_STALE | `pnpm install` |
| `Maximum call stack size exceeded` | RECURSION | Fix infinite loop |
| `out of memory` | OOM | Reduce bundle size, split chunks |

### Runtime Errors

| Error Pattern | Class | Auto-Fix |
|--------------|-------|----------|
| `500 Internal Server Error` | SERVER_ERROR | Check logs, check env vars |
| `404 Not Found` | ROUTE_MISSING | Verify route exists |
| `CORS error` | CORS | Check vercel.json headers |
| `Database connection refused` | DB_DOWN | Check POSTGRES_URL, pool config |
| `Environment variable not found` | MISSING_ENV | Add to Vercel project env |
| `edge function timeout` | EDGE_TIMEOUT | Extend timeout or move to serverless |

## Auto-Remediation Loop

When a deploy fails:
1. Parse error log to classify the error
2. Apply the corresponding auto-fix
3. Commit and push the fix
4. Wait for new deploy
5. Verify health
6. Repeat up to 3 times (max 3 retries)

```
Attempt 1: Parse error → Apply fix → Push → Wait 60s → Verify
Attempt 2: If still failing → Try alternative fix → Push → Wait
Attempt 3: Last resort → Revert last change → Push → Verify
If 3 attempts fail → Alert human, create incident ticket
```

## Preview Deploy Lifecycle

```
Feature branch push
  → Vercel builds preview: <branch-slug>.vercel.app
  → PR comment with preview URL
  → On PR merge to main:
    → Preview alias promoted to production
    → Old production deployment archived
    → Branch deleted (auto-cleanup)
```

## Environment Variable Management

Never hardcode URLs or secrets. Always use:
- `process.env.VERCEL_URL` for the deployment URL
- `process.env.NEXT_PUBLIC_VERCEL_URL` for client-side
- `vercel.json` redirects for routing

## Health Check Endpoints

Always include these endpoints for every project:
- `/api/health` → `{ status: "ok", timestamp }`
- `/api/models` → available model list (for V2)
- `/` → 200 HTML response

## Rollback Procedure

If production deploy breaks something:
```bash
vercel deployments ls --prod           # Find last successful deployment
vercel rollback <DEPLOYMENT_ID>        # Rollback to it
curl -sS "https://neptune-v2.vercel.app/"  # Verify
```

## Vercel-Specific Patterns

- **Serverless functions**: Max 60s execution (default), configurable in vercel.json
- **Edge functions**: Max 30s, limited Node.js APIs
- **ISR**: Use `revalidate` for incremental static regeneration
- **Preview deployments**: Access via `VERCEL_URL` env var
- **Domains**: Configure in Vercel dashboard, not code
- **Analytics**: Enable Vercel Analytics for deployment monitoring

## Do NOT

- Commit `.vercel/` directory to git
- Use `vercel dev` as the production URL
- Rely on `localhost` URLs in production code
- Skip post-deploy health check
- Deploy to production without preview verification first
