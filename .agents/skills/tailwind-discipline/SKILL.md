---
name: tailwind-discipline
description: Tailwind CSS v3 best practices — mobile-first design, design tokens via Tailwind config, no magic numbers, version compatibility, responsive breakpoints, dark mode with class strategy, and performance optimization. Triggers on "tailwind", "tailwindcss", "css", "styling", "responsive", "mobile-first", "breakpoint", "dark mode", "design tokens", "spacing", "color", "typography", "animation".
---

You are a Tailwind CSS disciplinarian. Every style follows mobile-first, token-based conventions with zero magic numbers.

## Core Principles

1. **Mobile-first**: base styles are mobile, `sm:` and up add complexity
2. **Design tokens**: never use raw values; all spacing/colors from config
3. **No magic numbers**: no `px-[17px]`, no `w-[342px]`
4. **Utility-first**: prefer utility classes over custom CSS
5. **Version lock**: Tailwind v3 (no v4 features, no `@import "tailwindcss"`)

## Spacing Scale

Use only Tailwind's default spacing scale:

```
0, px, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11, 12,
14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 72, 80, 96
```

```tsx
// ✅ CORRECT
<div className="p-4 mt-6 gap-8 max-w-2xl" />

// ❌ WRONG — magic numbers
<div className="p-[17px] mt-[23px] max-w-[342px]" />
```

**Exception**: `max-w-7xl`, `max-w-screen-2xl` for container widths. Use `p-[3px]` only for pixel-perfect alignment when necessary (justify in comment).

## Color Tokens

Always use semantic color tokens, never raw hex/rgb:

```tsx
// ✅ CORRECT
<div className="bg-primary text-primary-foreground border-border" />
<button className="bg-destructive text-destructive-foreground" />
<span className="text-muted-foreground" />

// ❌ WRONG
<div className="bg-[#1a1a2e] text-[#e94560]" />
```

Define custom colors in `tailwind.config.ts` under `theme.extend.colors`:

```ts
theme: {
  extend: {
    colors: {
      brand: { 50: '#...', 500: '#...', 900: '#...' },
    }
  }
}
```

## Responsive Breakpoints

```tsx
// Mobile-first: default is mobile, sm+ adds complexity
<div className="
  grid grid-cols-1          // mobile: 1 column
  sm:grid-cols-2             // tablet: 2 columns
  lg:grid-cols-3             // desktop: 3 columns
  gap-4                      // consistent gap at all sizes
  px-4 sm:px-6 lg:px-8       // progressive padding
">
```

**Breakpoint reference** (Tailwind v3):
- `sm`: 640px — large phones, small tablets
- `md`: 768px — tablets
- `lg`: 1024px — small laptops
- `xl`: 1280px — desktops
- `2xl`: 1536px — large screens

## Dark Mode

Neptune uses `class` strategy:

```tsx
// tailwind.config.ts
module.exports = { darkMode: "class" };

// In components:
<div className="bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-50">
```

Every color usage should have a `dark:` variant. Use semantic tokens to reduce repetition:

```tsx
// ✅ Better — tokens handle dark mode automatically
<div className="bg-background text-foreground" />
```

## Typography

Use Tailwind's font size scale (never custom):

```
text-xs    // 12px — captions, labels
text-sm    // 14px — body small
text-base  // 16px — body default
text-lg    // 18px — emphasized body
text-xl    // 20px — small headings
text-2xl   // 24px — section headings
text-3xl   // 30px — page headings
text-4xl   // 36px — hero headings
```

Font weights: `font-normal` (400), `font-medium` (500), `font-semibold` (600), `font-bold` (700).

Line heights: `leading-none` (1), `leading-tight` (1.25), `leading-snug` (1.375), `leading-normal` (1.5), `leading-relaxed` (1.625).

## Layout Patterns

```tsx
// Centered content with max width
<main className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

// Flex layouts
<div className="flex items-center justify-between">
<div className="flex flex-col sm:flex-row gap-4">

// Grid layouts
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

// Stack with consistent spacing
<div className="space-y-4">{/* children */}</div>
```

## Conditional Classes

Use `clsx` or `cn()` utility for conditional classes:

```tsx
import { cn } from "@/lib/utils";

<button className={cn(
  "base-styles",
  variant === "primary" && "bg-primary text-primary-foreground",
  variant === "secondary" && "bg-secondary text-secondary-foreground",
  disabled && "opacity-50 cursor-not-allowed",
  className // allow consumer overrides
)} />
```

## Performance Rules

- **Never `@apply` complex compositions** — use component composition instead
- **Avoid deep nesting** of variants — extract to separate components
- **PurgeCSS is automatic** in Tailwind v3 — don't safelist unless absolutely necessary
- **No inline `style={{}}`** — use Tailwind classes or CSS modules if truly custom
- **Prefer `gap` over `space-y`/`space-x`** in flex/grid containers

## Anti-Patterns

- ❌ `w-[342px]` — use `max-w-sm`, `w-80`, etc.
- ❌ `h-[57px]` — use `h-14` or `h-16`
- ❌ `text-[#ff0000]` — use `text-red-500` or add to config
- ❌ `mt-[-3px]` — rethink the layout; negative margins are fragile
- ❌ `!important` in Tailwind — use the `!` prefix: `!mt-0`
- ❌ `@apply` in CSS files — use components
- ❌ Mixing Tailwind v3 and v4 syntax
