---
name: remove-demo-limits
description: Removes Open Harness hosted demo restrictions from a fork. Use when a maintainer wants to remove managed-template trial caps, hosted deployment gating, or deploy your own limits. Triggers on remove demo limits, remove trial limits, remove hosted restrictions.
version: 1.0.0
---

# Remove Demo Limits — Unlock Full Capabilities

Removes Open Harness hosted demo restrictions from a fork.

## When to Use

- Removing managed-template trial caps
- Disabling hosted deployment gating
- Unlocking "deploy your own" limits
- Removing any hosted demo restrictions

## What Gets Removed

1. **Trial Caps** — Usage limits on API calls, sandbox minutes, or agent runs
2. **Deployment Gating** — Restrictions on deploying to production
3. **Watermarks** — "Demo" or "Trial" badges in the UI
4. **Feature Flags** — Gated features behind demo mode checks
5. **Rate Limits** — Artificial throttling on API endpoints

## Process

1. **Identify Restrictions** — Search codebase for demo/trial/limit patterns
2. **Audit Impact** — Verify removing each restriction won't break functionality
3. **Remove Gating Logic** — Delete or comment out demo checks
4. **Update Configuration** — Set appropriate production defaults
5. **Verify** — Test that all features work without restrictions

## Common Patterns to Remove

```typescript
// REMOVE: Demo mode check
if (process.env.DEMO_MODE === 'true') {
  return { limited: true, maxItems: 10 };
}

// REMOVE: Trial expiration check  
if (Date.now() > trialEndDate) {
  throw new Error('Trial expired');
}
```

## Safety

- Always back up configuration before removing limits
- Test in development environment first
- Document what was changed for future reference
