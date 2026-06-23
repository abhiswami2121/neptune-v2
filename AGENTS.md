# AGENTS.md — Neptune V2 (Coding Agent Harness)

> **Cardinal 109 SHARED BRAIN reference.** Read this before making any code changes.
> Updated on every major feature add. Persistent across all agent sessions.
> **Cardinal 110**: V2 AGENTS.md has different content than Chat — these are separate concerns.

Last updated: 2026-06-22
Repository: abhiswami2121/neptune-v2
Deployment: Vercel → https://neptune-v2.vercel.app
Latest commit: 9a8aca7 — fix/v2-build-workflow-plugin merged

## Project Overview

Neptune V2 is NewLeaf's **coding agent harness** — a sandboxed execution environment for AI-generated code. It provides:

- **Sandbox Lifecycle**: Create, snapshot, restore, and destroy isolated Vercel Sandbox instances
- **Agent Runtime**: `@open-agents/agent` package — ToolLoopAgent with Anthropic/OpenAI providers
- **GitHub Integration**: PR creation, code review, repo operations via Octokit
- **Better Auth**: Vercel OAuth (sign-in) + GitHub OAuth (repo access) with JWE session management
- **Chat Bridge**: Bidirectional SSE streaming to neptune-chat for progress updates and PR card rendering

## Stack

- **Framework**: Next.js 16.2.1 (App Router) + React 19.2
- **AI**: Vercel AI SDK (catalog), `@open-agents/agent` (ToolLoopAgent), Anthropic + OpenAI
- **Sandbox**: `@open-agents/sandbox` — Vercel Sandbox with snapshot/restore lifecycle
- **Database**: Drizzle ORM + PostgreSQL (Neon, Vercel Postgres)
- **Cache**: ioredis (Upstash Redis)
- **Auth**: Better Auth v1.6.5 — Vercel OAuth + GitHub OAuth + JWE (`jose`)
- **UI**: Tailwind CSS v4 + shadcn/ui + Radix UI + framer-motion
- **Monorepo**: pnpm workspaces + Turbo
- **Runtime**: Node.js 24.x, pnpm 11.5
- **Quality**: oxlint + oxfmt (ultracite), Bun for tests, TypeScript strict

### Monorepo Structure

```
neptune-v2/
├── apps/web/               # Next.js app — UI, API routes, auth, DB
│   ├── app/                # App Router pages
│   │   └── api/chat/      # Chat endpoint (V2 agent interactions)
│   ├── lib/                # Shared lib: auth, db, sandbox client, agent bridge
│   │   ├── auth/config.ts  # Better Auth configuration
│   │   ├── db/schema.ts    # Drizzle ORM schema
│   │   └── db/migrate.ts   # Migration runner (auto-runs on build)
│   └── components/         # UI components
├── packages/agent/         # @open-agents/agent — AI agent runtime
├── packages/sandbox/       # @open-agents/sandbox — Sandbox lifecycle management
├── packages/shared/        # @open-agents/shared — Shared types and utilities
└── tsconfig/               # Shared TypeScript configs
```

## Build Commands

```bash
pnpm install             # Install dependencies (run first)
pnpm dev                 # Start all packages (turbo dev)
pnpm web                 # Run web app only
pnpm build               # Full build (turbo build) — runs DB migrate first
pnpm typecheck           # TypeScript check all packages
pnpm check               # Lint + format check (ultracite)
pnpm fix                 # Auto-fix lint + format
pnpm ci                  # Full CI: check + typecheck + test
pnpm test:isolated       # Run tests (isolated runner)
pnpm test:verbose        # Run tests with JUnit output
pnpm sandbox:snapshot-base # Refresh base sandbox snapshot
```

## Deploy Procedure

1. Push to `main` triggers Vercel auto-deploy
2. Per Cardinal 75: **freeze auto-deploy**, verify build passes locally, unfreeze per phase, re-freeze after confirming `state=READY`
3. Migrations run automatically during `pnpm build` (via `lib/db/migrate.ts`)
4. Preview deployments get isolated Neon database branches (no production data access)
5. All PRs merged via `gh pr merge --merge --delete-branch`

## Key Files

| File | Purpose |
|------|---------|
| `apps/web/app/api/chat/route.ts` | V2 chat endpoint — agent interaction |
| `apps/web/lib/auth/config.ts` | Better Auth config (Vercel + GitHub OAuth, JWE sessions) |
| `apps/web/lib/db/schema.ts` | Drizzle ORM schema — modify then run `db:generate` |
| `apps/web/lib/db/migrate.ts` | Migration runner — auto-runs on build |
| `packages/agent/index.ts` | Agent runtime — ToolLoopAgent with provider config |
| `packages/sandbox/index.ts` | Sandbox lifecycle — create, snapshot, restore, destroy |
| `packages/sandbox/vercel/sandbox.ts` | Vercel Sandbox implementation |
| `apps/web/docs/agents/architecture.md` | Detailed architecture reference |
| `apps/web/docs/agents/code-style.md` | Code style and patterns |
| `apps/web/docs/agents/lessons-learned.md` | Accumulated learnings |

## Production State Reference

**ALWAYS check these files before code planning** per **Cardinal 102**:
- `jarvis/cortex/wiki/projects/neptune-v2/PRODUCTION-STATE.md` — current HEAD, deploy status, known issues
- `ACTIVE-GAPS.md` — known gaps, in-progress work, blocked items
- `jarvis/cortex/wiki/projects/neptune-v2/SPRINTS.md` — current sprint scope

**IMPORTANT**: If user request is already a known gap, acknowledge it. If it conflicts with PRODUCTION-STATE, ASK before proceeding.

## Conventions

### Cardinals (NON-NEGOTIABLE)
- **Cardinal 61**: ONE PR per phase — never batch phase changes
- **Cardinal 75**: Freeze auto-deploy until verified, unfreeze per phase, re-freeze after READY
- **Cardinal 80**: Cite vault docs (playbooks, PRDs, research) in PR descriptions
- **Cardinal 95**: `pnpm build` MUST pass locally before every commit
- **Cardinal 102**: Check PRODUCTION-STATE.md + ACTIVE-GAPS.md before code planning
- **Cardinal 109**: SHARED BRAIN — cortex playbooks, skills, and project state are universal across repos
- **Cardinal 110**: Don't merge Chat + V2 UX — AGENTS.md content differs per repo

### Code Style
- **Files**: kebab-case, **Types**: PascalCase, **Functions**: camelCase
- **Never use `any`** — use `unknown` and narrow with type guards
- **No `.js` extensions** in imports
- **Ultracite** (oxlint + oxfmt) for linting and formatting (double quotes, 2-space indent)
- **Zod** schemas for validation, derive types with `z.infer`
- **Do NOT append** new functionality to bottom of existing files — extract into focused modules
- **Quote paths with brackets** (Next.js dynamic routes like `[id]`) in git commands

### Git
- **Branch sync**: Prefer `git merge origin/main` over rebase unless explicitly requested
- One commit per phase, `<type>: <description>` format
- Quote paths with special characters: `git add "apps/web/app/tasks/[id]/page.tsx"`

### Database
- After modifying `schema.ts`, ALWAYS run `pnpm --dir apps/web db:generate` and commit the generated `.sql` migration
- **Do NOT use `db:push`** except for local throwaway databases
- Migrations run automatically during `pnpm build`
- Preview deployments get isolated Neon database branches

### Test Requirements
- Run `pnpm ci` after making changes
- Use `bun test` for running tests, `bun test --watch` for watch mode
- Prefer `pnpm <script>` over invoking tool binaries directly

## Sharing — Universal Brain

This repo participates in the **SHARED BRAIN** architecture (Cardinal 109):

| Resource | Location |
|----------|----------|
| Cortex Playbooks | `jarvis/cortex/playbook-skills/playbooks/coding/PLAYBOOK.md` |
| Cortex Skills | `jarvis/cortex/skills/` |
| Project State | `jarvis/cortex/wiki/projects/neptune-v2/` |
| Research | `jarvis/cortex/research/` |
| Mission Staging | `jarvis/cortex/missions/` |
| Active Gaps | `ACTIVE-GAPS.md` at repo root |

## Escalation

- **Slack**: `#jarvis-admin` (C0AQDDC3HAB) ONLY — never newleaf-admin
- **Author**: abhiswami2121@gmail.com
- **Emergency**: Check PRODUCTION-STATE.md for current deploy status before escalation

## Known Anti-Patterns

1. **db:push in production**: Never. Use `db:generate` + commit migration + build.
2. **Mixing Chat + V2 UX**: Cardinal 110 — repos have different AGENTS.md, different concerns.
3. **Direct tool invocation**: Use `pnpm <script>`, not `tsc` or `eslint` directly.
4. **Unquoted bracket paths**: `git add apps/web/app/tasks/[id]/page.tsx` fails — quote it.
5. **Appending to bottom of files**: Extract into focused modules instead.

---

END OF AGENTS.md
