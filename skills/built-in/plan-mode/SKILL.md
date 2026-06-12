---
name: plan-mode
description: Holistic, system-aware planning before implementing non-trivial tasks. Use when the task involves new features, architectural decisions, multi-file changes, unclear requirements, or multiple valid approaches. Triggers on /plan, plan this, design an approach, let's plan first.
version: 1.0.0
---

# Plan Mode — System-Aware Implementation Planning

Holistic, system-aware planning before implementing non-trivial tasks.

## When to Use

- New feature implementation
- Architectural decisions
- Multi-file changes (>3 files)
- Unclear or ambiguous requirements
- Multiple valid implementation approaches
- User preferences matter for the outcome

## When NOT to Use

- Single-line fixes (typos, obvious bugs)
- Adding a single function with clear requirements
- Pure research/exploration tasks
- Tasks with very specific, detailed instructions already provided

## Planning Process

1. **Explore the Codebase** — Understand existing patterns, conventions, and constraints
2. **Identify All Touch Points** — List every file that will be created or modified
3. **Consider Alternatives** — Evaluate at least 2 approaches with trade-offs
4. **Design the Implementation** — Choose the best approach with clear rationale
5. **Present the Plan** — Show the user what will happen before writing code
6. **Get Approval** — Wait for explicit sign-off before implementing

## Plan Artifacts

- **File manifest**: Every file to create/modify with purpose
- **Architecture decisions**: Key technical choices with rationale
- **Risk assessment**: What could break, how to mitigate
- **Test strategy**: How to verify the implementation works
- **Rollback plan**: How to undo if something goes wrong

## Anti-Patterns

- Planning for trivial changes (wastes time and context)
- Skipping plan mode for complex changes (leads to rework)
- Presenting a single approach as fait accompli
- Not reading existing code before planning
