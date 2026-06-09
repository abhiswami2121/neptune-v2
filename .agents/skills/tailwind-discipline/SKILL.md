---
name: tailwind-discipline
description: Mobile-first responsive design, design token system, no magic numbers, and Tailwind CSS v3/v4 compatibility. Triggers on "Tailwind", "CSS", "styling", "responsive", "mobile", "design token", "spacing", "color", "typography", "layout", "flex", "grid".
---

You are a Tailwind CSS disciplinarian. You write consistent, maintainable, mobile-first styles that scale across all screen sizes.

## Mobile-First Design

ALWAYS start styling for mobile, then add breakpoints for larger screens:

```html
<!-- ❌ Desktop-first (wrong) -->
<div class="w-1/2 max-sm:w-full">

<!-- ✅ Mobile-first (correct) -->
<div class="w-full sm:w-1/2">
```

Breakpoint scale:
- `sm:` — 640px (large phones landscape)
- `md:` — 768px (tablets)
- `lg:` — 1024px (small laptops)
- `xl:` — 1280px (desktops)
- `2xl:` — 1536px (large screens)

## Design Token System

### Colors
Use semantic color tokens, never raw values:

| Token | Usage |
|-------|-------|
| `bg-background` | Page background |
| `bg-card` | Card/surface background |
| `text-foreground` | Primary text |
| `text-muted-foreground` | Secondary text |
| `border-border` | Borders |
| `bg-primary` / `text-primary-foreground` | Primary actions |
| `bg-secondary` / `text-secondary-foreground` | Secondary elements |
| `bg-destructive` / `text-destructive-foreground` | Destructive actions |
| `bg-muted` / `text-muted-foreground` | Muted/de-emphasized |

### Spacing
Use the built-in spacing scale:
- `p-1` → 4px, `p-2` → 8px, `p-3` → 12px, `p-4` → 16px
- `p-6` → 24px, `p-8` → 32px, `p-12` → 48px
- `gap-2` → 8px gap between flex/grid items

### Typography
```html
<h1 class="text-4xl font-bold tracking-tight">Heading</h1>
<h2 class="text-2xl font-semibold tracking-tight">Subheading</h2>
<p class="text-base text-muted-foreground leading-relaxed">Body text</p>
<small class="text-sm text-muted-foreground">Caption</small>
```

## No Magic Numbers

❌ NEVER use arbitrary values without consideration:
```html
<div class="w-[347px] mt-[23px] text-[#FF5733]">
```

✅ Use the scale or design tokens:
```html
<div class="w-80 mt-6 text-destructive">
```

When you MUST use arbitrary values:
- Widths: prefer fractional or full-width (`w-full`, `w-1/2`)
- Heights: only when content height is truly fixed
- Colors: ALWAYS use theme tokens, never arbitrary hex

## Layout Patterns

### Page Layout
```html
<div class="min-h-screen bg-background">
  <header class="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
    <nav class="container flex h-14 items-center">
      <!-- navbar -->
    </nav>
  </header>
  <main class="container flex-1 py-6">
    <!-- content -->
  </main>
  <footer class="border-t py-6">
    <!-- footer -->
  </footer>
</div>
```

### Container Sizing
```html
<div class="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
```

### Card Grid
```html
<div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
  <Card>...</Card>
  <Card>...</Card>
  <Card>...</Card>
</div>
```

### Flex Centering
```html
<div class="flex items-center justify-between">
  <div>Left</div>
  <div>Right</div>
</div>
```

### Responsive Stack to Row
```html
<div class="flex flex-col gap-4 sm:flex-row sm:items-center">
```

## State Variants

Always handle these states when applicable:
```html
<button class="... hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50">
```

State prefix order: `hover:` → `focus:` → `focus-visible:` → `active:` → `disabled:`

## Version Compatibility

### Tailwind v3 (current standard)
- Uses `@tailwind base/components/utilities`
- `darkMode: "class"` in config
- Arbitrary values: `w-[300px]`

### Tailwind v4 (upcoming)
- CSS-first config: `@import "tailwindcss"`
- Dark mode: `@variant dark (&:is(.dark *))`
- OKLCH colors by default
- Container queries: `@container`

**Keep all code Tailwind v3 compatible until V2 migrates to v4.**

## Common Anti-Patterns

❌ `float`, `clear` — use flex/grid
❌ `!important` — increase specificity through proper layering
❌ `style={{}}` inline styles — use className
❌ Mixing margin and padding for spacing — choose one strategy
❌ `mt-4` on first child — use `gap-4` on parent instead
❌ `w-screen` — use `w-full` or `w-dvw` instead
❌ `overflow-hidden` on body — breaks sticky positioning
