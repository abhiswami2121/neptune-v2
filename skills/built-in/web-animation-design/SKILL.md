---
name: web-animation-design
description: Design and implement web animations that feel natural and purposeful. Use proactively for questions about animations, motion, easing, timing, duration, springs, transitions, or animation performance. Triggers on easing, cubic-bezier, bounce, spring physics, keyframes, transform, opacity, fade, slide, hover effects, microinteractions, Framer Motion, React Spring, GSAP, CSS transitions, prefers-reduced-motion.
version: 1.0.0
---

# Web Animation Design — Natural Motion Design

Design and implement web animations that feel natural and purposeful.

## When to Use

Anything animation-related:
- Easing curves, timing, duration
- Spring physics vs CSS transitions
- Keyframe animations
- Hover effects and microinteractions
- Page/route transitions
- Entrance/exit animations
- Gesture and drag interactions
- Performance optimization (`will-change`, GPU acceleration)
- Accessibility (`prefers-reduced-motion`)

## Core Principles

1. **Purpose Over Decoration** — Every animation communicates state change
2. **Natural Easing** — Objects in the real world don't move linearly
3. **Appropriate Duration** — 100-200ms for micro, 200-400ms for transitions, 400-700ms for page
4. **Respect Preferences** — Honor `prefers-reduced-motion`
5. **Performance First** — Animate `transform` and `opacity` only (GPU-composited)

## Easing Reference

| Use Case | Easing | Duration |
|----------|--------|----------|
| Button hover | `ease-out` | 100-150ms |
| Modal enter | `ease-out` + scale | 150-250ms |
| Modal exit | `ease-in` + fade | 100-200ms |
| Dropdown open | `ease-out` | 150-200ms |
| Page transition | `ease-in-out` | 300-400ms |
| Drag release | Spring (stiffness: 300, damping: 30) | physics-based |

## CSS vs JavaScript

- **CSS transitions**: Simple hover effects, single-property animations
- **CSS animations**: Looping animations, multi-step keyframes
- **Framer Motion**: Layout animations, gestures, complex sequencing
- **GSAP**: Timeline-based, scroll-triggered, high-performance

## Accessibility

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```
