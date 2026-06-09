---
name: a11y-checklist
description: Web accessibility standards — semantic HTML, ARIA attributes, keyboard navigation, color contrast ratios, focus states, screen reader support, and WCAG 2.1 AA compliance. Triggers on "accessibility", "a11y", "ARIA", "keyboard navigation", "screen reader", "focus state", "color contrast", "WCAG", "semantic HTML", "alt text", "role", "tabindex", "accessible", "ADA".
---

You ensure every UI component is accessible. All interfaces must meet WCAG 2.1 AA standards at minimum.

## Core Principles (POUR)

1. **Perceivable** — Users can perceive content (text, images, audio)
2. **Operable** — Users can operate UI (keyboard, touch, voice)
3. **Understandable** — Content and UI behavior is predictable
4. **Robust** — Works across browsers, assistive tech, and devices

## 1. Semantic HTML (Always First)

Use native HTML elements before reaching for ARIA:

```tsx
// ✅ CORRECT — semantic, accessible by default
<header>
  <nav aria-label="Main">
    <ul><li><a href="/">Home</a></li></ul>
  </nav>
</header>
<main>
  <article>
    <h1>Page Title</h1>
    <section><h2>Section</h2></section>
  </article>
</main>
<footer>...</footer>

// ❌ WRONG — div soup, no semantics
<div className="header"><div className="nav"><div className="link">Home</div></div></div>
```

**Semantic element checklist**:
- `<header>`, `<main>`, `<footer>` for page structure
- `<nav>` for navigation (with `aria-label` if multiple)
- `<article>` for self-contained content
- `<section>` for thematic grouping (with heading)
- `<button>` for actions (never `<div onClick>`)
- `<a>` for navigation (never `<div onClick={router.push}>`)
- `<form>` for forms (with `<label>` for every input)

## 2. Heading Hierarchy

Never skip heading levels:

```tsx
// ✅ CORRECT — logical hierarchy
<h1>Page Title</h1>
  <h2>Section One</h2>
    <h3>Subsection</h3>
  <h2>Section Two</h2>

// ❌ WRONG — skipped levels
<h1>Page</h1>
  <h3>Section</h3>  {/* h2 skipped! */}
```

**One `<h1>` per page**. Use heading levels to convey structure, not for visual size.

## 3. ARIA — Use Only When Necessary

"No ARIA is better than bad ARIA." Use native HTML first.

```tsx
// ✅ Correct ARIA usage
<button aria-expanded={isOpen} aria-controls="menu-panel">Menu</button>
<div id="menu-panel" role="menu" hidden={!isOpen}>...</div>

// ✅ Live regions for dynamic content
<div aria-live="polite" aria-atomic="true">{statusMessage}</div>

// ❌ WRONG — redundant ARIA
<button role="button">Click</button>  {/* button already has role="button" */}
<a href="/" role="link">Home</a>      {/* a with href already has role="link" */}
```

**ARIA rules of thumb**:
- Don't override native semantics
- All interactive elements need an accessible name
- `aria-label` for elements without visible text
- `aria-labelledby` to reference existing text
- `aria-describedby` for supplemental descriptions
- `aria-hidden="true"` for decorative/presentational elements

## 4. Keyboard Navigation

Every interactive element must be keyboard accessible:

```tsx
function CustomSelect({ options, value, onChange }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div
      role="combobox"
      aria-expanded={isOpen}
      aria-haspopup="listbox"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { setIsOpen(!isOpen); e.preventDefault(); }
        if (e.key === "Escape") { setIsOpen(false); }
        if (e.key === "ArrowDown") { /* focus next option */ }
      }}
    >
      <span>{value || "Select..."}</span>
      {isOpen && (
        <ul role="listbox">
          {options.map(opt => (
            <li key={opt.value} role="option" aria-selected={opt.value === value}
                onClick={() => { onChange(opt.value); setIsOpen(false); }}>
              {opt.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

**Keyboard rules**:
- `Tab` navigates between focusable elements
- `Enter`/`Space` activates buttons
- `Escape` closes dialogs/dropdowns
- `Arrow keys` navigate within composites (tabs, lists, menus)
- Focus order matches visual order
- No `tabindex` > 0 (use 0 or -1 only)
- Focus trap in modals (focus stays inside until dismissed)

## 5. Color Contrast (WCAG AA)

| Element | Minimum Ratio |
|---------|--------------|
| Normal text (< 18px) | 4.5:1 |
| Large text (≥ 18px bold or ≥ 24px) | 3:1 |
| UI components (icons, borders) | 3:1 |
| Focus indicators | 3:1 against background |

```tsx
// Never convey information with color alone
// ✅ CORRECT — uses icon + text
<span className="text-destructive">
  <AlertCircle className="inline h-4 w-4" /> Error: Invalid input
</span>

// ❌ WRONG — color only (invisible to colorblind users)
<span className="text-red-500">Invalid input</span>
```

## 6. Focus States

Every interactive element needs a visible focus indicator:

```tsx
// Tailwind's default focus ring
<button className="focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
  Click me
</button>
```

**Focus rules**:
- Use `focus-visible` (not `focus`) — only shows for keyboard, not mouse
- Never `outline: none` without a replacement
- Focus ring must have 3:1 contrast against adjacent colors
- Add "Skip to main content" link as first focusable element

## 7. Images and Media

```tsx
// Informative images: descriptive alt text
<Image src="/chart.png" alt="Revenue grew 25% YoY from 2023 to 2024" />

// Decorative images: empty alt
<Image src="/decorative-wave.svg" alt="" />

// Complex images: provide long description
<Image src="/architecture.png" alt="System architecture" aria-describedby="arch-desc" />
<p id="arch-desc" className="sr-only">Detailed description of the architecture...</p>
```

## 8. Forms

```tsx
// Every input needs a label
<div>
  <Label htmlFor="email">Email address</Label>
  <Input id="email" type="email" aria-describedby="email-hint email-error" />
  <p id="email-hint" className="text-sm text-muted-foreground">
    We'll never share your email.
  </p>
  {error && (
    <p id="email-error" className="text-sm text-destructive" role="alert">
      {error}
    </p>
  )}
</div>
```

**Form rules**:
- Every input has `<label>` with `htmlFor` matching `id`
- Errors use `role="alert"` for screen reader announcement
- Required fields use `required` attribute + visual indicator
- Group related fields with `<fieldset>` + `<legend>`

## 9. Motion & Animation

Respect `prefers-reduced-motion`:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

## Quick Checklist (Before Commit)

- [ ] Page has exactly one `<h1>`
- [ ] All images have `alt` text (or empty `alt=""` for decorative)
- [ ] All form inputs have associated `<label>`
- [ ] All interactive elements are keyboard accessible
- [ ] Focus order is logical and visible
- [ ] Color is never the only way to convey information
- [ ] `aria-label` on icon-only buttons/links
- [ ] `role="alert"` on dynamic error messages
- [ ] `prefers-reduced-motion` respected
- [ ] Page has `<main>` landmark
- [ ] `lang` attribute on `<html>` element
- [ ] Document has descriptive `<title>`
