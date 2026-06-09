---
name: a11y-checklist
description: Semantic HTML, ARIA attributes, keyboard navigation, color contrast, focus states, and screen reader compatibility. Triggers on "accessibility", "a11y", "ARIA", "keyboard", "screen reader", "focus", "contrast", "WCAG", "semantic HTML", "alt text", "label", "role".
---

You are an accessibility enforcer. Every component and page must be usable by everyone, regardless of how they interact with the web. WCAG 2.1 AA is the minimum standard.

## Semantic HTML First

Use the right HTML element for the job before reaching for ARIA:

| Element | When to Use |
|---------|------------|
| `<button>` | Clickable actions (not `<div onclick>`) |
| `<a>` | Navigation links (not `<span onclick>`) |
| `<nav>` | Navigation sections |
| `<main>` | Primary page content |
| `<header>` | Page or section headers |
| `<footer>` | Page or section footers |
| `<section>` | Thematic content grouping |
| `<article>` | Self-contained content |
| `<aside>` | Complementary content |
| `<form>` | Form containers (not `<div>`) |
| `<label>` | Input labels (always pair with inputs) |
| `<fieldset>` + `<legend>` | Group related form fields |
| `<table>` | Tabular data (not `<div>` grid) |
| `<ul>` / `<ol>` | Lists (not `<div>` with bullets) |
| `<h1>`–`<h6>` | Headings (never skip levels) |

## Heading Hierarchy

Every page must start with exactly one `<h1>`. Headings must not skip levels:

```html
<h1>Page Title</h1>          <!-- Exactly one -->
  <h2>Section</h2>            <!-- h1 → h2, NOT h1 → h3 -->
    <h3>Subsection</h3>       <!-- h2 → h3 -->
  <h2>Another Section</h2>
```

## Images & Media

```html
<!-- Informative image: descriptive alt text -->
<img src="chart.png" alt="Revenue chart showing 25% growth in Q4" />

<!-- Decorative image: empty alt -->
<img src="decorative-line.png" alt="" />

<!-- Complex image: alt + long description -->
<img src="infographic.png" alt="Enrollment process flowchart" aria-describedby="flowchart-desc" />
<div id="flowchart-desc">Step 1: ...</div>

<!-- SVG icons: aria-hidden + title -->
<svg aria-hidden="true" focusable="false">
  <title>Search</title>
  <!-- ... -->
</svg>
```

## Forms

Every input must have an accessible label:

```tsx
{/* Explicit label */}
<label htmlFor="email">Email</label>
<input type="email" id="email" />

{/* Wrapped label */}
<label>
  <span>Email</span>
  <input type="email" />
</label>

{/* aria-label for icon-only inputs */}
<input type="search" aria-label="Search" />

{/* aria-labelledby for complex inputs */}
<span id="name-label">Full name</span>
<input aria-labelledby="name-label" />

{/* Error messages must be linked */}
<input aria-describedby="email-error" aria-invalid="true" />
<p id="email-error" role="alert">Please enter a valid email</p>
```

## Keyboard Navigation

All interactive elements must be keyboard accessible:

```tsx
// ✅ Button: naturally focusable and actionable
<button onClick={handleClick}>Submit</button>

// ✅ Custom interactive element: needs role + tabIndex + keyboard handler  
<div
  role="button"
  tabIndex={0}
  onClick={handleClick}
  onKeyDown={(e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  }}
>
  Click me
</div>

// ❌ Missing keyboard handler
<div onClick={handleClick}>Click me</div>
```

Focus order must be logical (follows visual layout). Don't use `tabIndex > 0`.

## Focus Management

```tsx
// Trap focus in modals
<DialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
  {/* Focus first input automatically */}
</DialogContent>

// Move focus after navigation
const router = useRouter();
router.push("/new-page");
// Focus the main content after navigation

// Skip to content link (first focusable element)
<a href="#main-content" className="sr-only focus:not-sr-only">
  Skip to content
</a>
```

Visible focus indicators on all interactive elements:
```css
:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}
```

## Color & Contrast

- **Text**: minimum 4.5:1 contrast ratio (WCAG AA)
- **Large text** (18px+ bold or 24px+): minimum 3:1
- **UI components** and graphical objects: minimum 3:1
- Never use color alone to convey information — add icons, text, or patterns

```tsx
// ❌ Color-only error
<p className="text-red-500">Required</p>

// ✅ Color + icon + text
<p className="flex items-center gap-1 text-destructive">
  <AlertCircle className="h-4 w-4" aria-hidden="true" />
  <span>This field is required</span>
</p>
```

## ARIA: Use Sparingly, Use Correctly

**First rule of ARIA**: Don't use ARIA if you can use semantic HTML.

Common correct ARIA uses:

```tsx
// Live regions for dynamic content
<div role="status" aria-live="polite">
  {message}
</div>
<div role="alert" aria-live="assertive">
  {errorMessage}
</div>

// Tab interface
<div role="tablist" aria-label="Settings tabs">
  <button role="tab" aria-selected={active === "general"} aria-controls="panel-general">
    General
  </button>
</div>
<div role="tabpanel" id="panel-general" aria-labelledby="tab-general">
  {/* content */}
</div>

// Toggle state
<button aria-pressed={isPressed} onClick={toggle}>
  {isPressed ? "On" : "Off"}
</button>

// Expandable sections
<button aria-expanded={isOpen} aria-controls="section-content">
  {isOpen ? "Collapse" : "Expand"}
</button>
<div id="section-content" hidden={!isOpen}>
  {/* content */}
</div>

// Loading state
<div role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
  {progress}% complete
</div>
```

## Screen Reader Only Content

```css
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
```

```tsx
<span className="sr-only">You have 3 unread messages</span>
```

## Page-Level Checklist

- [ ] Page has exactly one `<h1>`
- [ ] Heading hierarchy doesn't skip levels
- [ ] All images have appropriate `alt` text
- [ ] All form inputs have labels
- [ ] All interactive elements are keyboard accessible
- [ ] Focus order follows visual layout
- [ ] Visible focus indicators on all interactive elements
- [ ] Color contrast meets WCAG AA (4.5:1 for text)
- [ ] No information conveyed by color alone
- [ ] Page has a descriptive `<title>`
- [ ] Page has `lang` attribute on `<html>`
- [ ] Skip-to-content link available
- [ ] `aria-label` on icon-only controls
- [ ] Error messages linked via `aria-describedby`
- [ ] Dynamic content uses `aria-live` regions
