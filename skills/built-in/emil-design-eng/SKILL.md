---
name: emil-design-eng
description: Encodes Emil Kowalski's philosophy on UI polish, component design, animation decisions, and the invisible details that make software feel great. Use when designing components, reviewing UI, or making animation decisions.
version: 1.0.0
---

# Emil Design Engineering — UI Polish Philosophy

Encodes Emil Kowalski's philosophy on UI polish, component design, and animation decisions.

## Core Principles

1. **Feel Over Features** — A component that feels right is better than one with more features
2. **Invisible Details** — The best design decisions are ones users don't consciously notice
3. **Motion Has Meaning** — Every animation should communicate state change, not just decorate
4. **Typographic Hierarchy** — Type is the foundation; get it right before anything else
5. **Intentional Whitespace** — Space is an active design element, not leftover

## When to Use

- Designing new components
- Reviewing UI for polish
- Making animation timing/easing decisions
- Evaluating interaction patterns
- Ensuring design consistency

## Component Design Checklist

- [ ] Does it animate in/out naturally? (150-300ms, ease-out for enter, ease-in for exit)
- [ ] Are loading, empty, error, and success states handled?
- [ ] Does it work on both touch and mouse?
- [ ] Are hover states meaningful, not just decorative?
- [ ] Is the typography using the defined scale?
- [ ] Does spacing follow the 4px grid?

## Animation Guidelines

- **Enter**: ease-out, 150-250ms — feels responsive
- **Exit**: ease-in, 100-200ms — feels fast
- **Hover**: 100-150ms — instant feedback
- **Page transitions**: 200-400ms — deliberate but not slow
- **Never**: linear easing (feels robotic), durations over 500ms (feels slow)
