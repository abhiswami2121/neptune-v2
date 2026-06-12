---
name: vercel-react-best-practices
description: React and Next.js performance optimization guidelines from Vercel Engineering. Use when writing, reviewing, or refactoring React/Next.js code to ensure optimal performance patterns. Triggers on React components, Next.js pages, data fetching, bundle optimization, performance improvements.
version: 1.0.0
---

# Vercel React Best Practices — Performance Optimization

React and Next.js performance optimization guidelines from Vercel Engineering.

## When to Use

- Writing new React components
- Reviewing existing React/Next.js code
- Refactoring for performance
- Data fetching optimization
- Bundle size reduction
- General performance improvements

## Core Rules

### 1. Component Architecture
- **Server Components by default** — Use RSC unless you need interactivity
- **'use client' sparingly** — Only at the leaf nodes that need it
- **Composition over configuration** — Pass JSX as children, not config objects

### 2. Data Fetching
- **Fetch early, fetch in parallel** — Use Promise.all for independent requests
- **Cache aggressively** — Use `fetch` cache, React cache(), and unstable_cache
- **Stream when possible** — Use Suspense boundaries for progressive rendering

### 3. Bundle Optimization
- **Dynamic imports** — `next/dynamic` for heavy components below the fold
- **Tree-shakeable imports** — Import specific functions, not entire libraries
- **Image optimization** — Use `next/image` with proper sizes and priority

### 4. State Management
- **URL as state** — Use searchParams for shareable, bookmarkable state
- **useOptimistic** — For instant UI feedback with server reconciliation
- **Minimal client state** — Derive everything possible from server props

### 5. Rendering Performance
- **Memoize expensive computations** — useMemo for derived data
- **Stable references** — useCallback for event handlers passed to memo'd children
- **Avoid unnecessary re-renders** — Push state down to where it's used

## Anti-Patterns

- `'use client'` at the page root
- `useEffect` for data fetching
- Large barrel exports (`index.ts` re-exporting everything)
- Unoptimized images loading below the fold
- Context at the app root (causes full-tree re-render)
