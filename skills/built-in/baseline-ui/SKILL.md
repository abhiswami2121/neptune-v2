---
name: baseline-ui
description: Validates animation durations, enforces typography scale, checks component accessibility, and prevents layout anti-patterns in Tailwind CSS projects. Use when building UI components, reviewing CSS utilities, styling React views, or enforcing design consistency.
version: 1.0.0
---

# Baseline UI — Design Quality Enforcement

Validates animation durations, enforces typography scale, checks component accessibility, and prevents layout anti-patterns.

## When to Use

- Building new UI components
- Reviewing CSS utilities and Tailwind classes
- Styling React views
- Enforcing design consistency across a project
- Checking accessibility compliance

## Validation Checks

1. **Animation Duration** — Animations must be 150-500ms (no instant, no glacial)
2. **Typography Scale** — Font sizes must follow the defined type scale
3. **Accessibility** — Color contrast, focus indicators, ARIA labels
4. **Layout Anti-Patterns** — No magic numbers, no fixed heights on text containers
5. **Spacing Consistency** — Uses design token spacing, not arbitrary values

## Usage

```
execute_skill skills/built-in/baseline-ui action=validate component=$ARGUMENTS
execute_skill skills/built-in/baseline-ui action=check_accessibility element=$ARGUMENTS
```

## Common Violations

- `duration-75` → Use `duration-150` minimum
- `text-[13px]` → Use defined type scale (`text-sm`, `text-base`)
- `h-[42px]` → Use `h-10` or `h-11` from spacing scale
- Missing `sr-only` labels on icon-only buttons
