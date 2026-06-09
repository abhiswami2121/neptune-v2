---
name: error-state-coverage
description: Every route and component must handle loading, empty, error, not-found, and edge case states. Never show white screens or indefinite spinners. Triggers on "error state", "loading state", "empty state", "not found", "404", "error boundary", "error.tsx", "loading.tsx", "not-found.tsx", "skeleton", "edge case", "error handling".
---

You ensure every route and component handles all states. No page should ever show a white screen, unstyled error, or indefinite spinner.

## The Five States Every Page Must Handle

```
1. LOADING    — Data is being fetched
2. EMPTY      — Data loaded but there's nothing to show
3. ERROR      — Something went wrong
4. NOT FOUND  — The resource doesn't exist (404)
5. SUCCESS    — Everything worked (the happy path)
```

## Next.js Route-Level State Files

Every route segment should have these files:

### `loading.tsx` — Shown during page/segment loading

```tsx
// app/users/loading.tsx
export default function UsersLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-16 bg-muted rounded-lg" />
      ))}
    </div>
  );
}
```

**Rules for loading.tsx**:
- Use skeleton UI (not a bare spinner)
- Match the layout of the actual content
- Use `animate-pulse` for skeleton shimmer
- Export as default function

### `error.tsx` — Shown when an error occurs

```tsx
"use client"; // error.tsx MUST be a client component

export default function UsersError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
      <h2 className="text-xl font-semibold">Something went wrong</h2>
      <p className="text-muted-foreground text-sm">
        {error.message || "An unexpected error occurred"}
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
```

**Rules for error.tsx**:
- MUST be a Client Component (`"use client"`)
- Accept `error` and `reset` props
- Provide a retry mechanism (reset button)
- Log the error in production (Sentry, console.error, etc.)
- Never expose stack traces to users

### `not-found.tsx` — Shown for 404 pages

```tsx
// app/users/not-found.tsx
import Link from "next/link";

export default function UsersNotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
      <h2 className="text-2xl font-bold">Not Found</h2>
      <p className="text-muted-foreground">Could not find the requested resource.</p>
      <Button asChild>
        <Link href="/">Return Home</Link>
      </Button>
    </div>
  );
}
```

**Rules for not-found.tsx**:
- Can be Server or Client Component
- Provide navigation back to safe pages
- Use `notFound()` function to trigger from Server Components
- Give a clear message, not just "404"

## Component-Level State Handling

For data-fetching components:

```tsx
async function UserList() {
  try {
    const users = await db.user.findMany();

    // EMPTY state
    if (!users || users.length === 0) {
      return (
        <EmptyState
          icon={UsersIcon}
          title="No users yet"
          description="Create your first user to get started."
          action={<Button>Add User</Button>}
        />
      );
    }

    // SUCCESS state
    return <UserTable users={users} />;
  } catch (error) {
    // ERROR state
    console.error("Failed to fetch users:", error);
    return <ErrorState message="Could not load users" />;
  }
}
```

## Reusable State Components

Create shared state components:

```tsx
// components/states/empty-state.tsx
export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
      {Icon && <Icon className="h-12 w-12 text-muted-foreground/50" />}
      <h3 className="text-lg font-semibold">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground max-w-sm">{description}</p>
      )}
      {action}
    </div>
  );
}

// components/states/error-state.tsx
export function ErrorState({ title = "Something went wrong", message, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <AlertTriangle className="h-12 w-12 text-destructive/50" />
      <h3 className="text-lg font-semibold">{title}</h3>
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
```

## Edge Cases Coverage

| Scenario | State | Solution |
|----------|-------|----------|
| API returns 500 | ERROR | error.tsx with retry |
| API returns empty array | EMPTY | EmptyState component |
| API takes > 5s | LOADING | loading.tsx with skeleton |
| User navigates to deleted resource | NOT FOUND | notFound() → not-found.tsx |
| Network offline | ERROR | Detect with navigator.onLine |
| Rate limited (429) | ERROR | Show retry-after time |
| Auth expired (401) | ERROR | Redirect to login |
| Permission denied (403) | ERROR | Show "access denied" message |
| Large dataset loading | LOADING | Progressive skeleton |
| Form validation errors | ERROR | Inline field errors |

## Progressive Enhancement Pattern

```tsx
// Wrap data-dependent sections in Suspense with fallbacks
import { Suspense } from "react";

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <h1>Dashboard</h1>
      <Suspense fallback={<StatsSkeleton />}>
        <StatsSection />
      </Suspense>
      <Suspense fallback={<TableSkeleton rows={5} />}>
        <RecentActivitySection />
      </Suspense>
    </div>
  );
}
```

## Checklist: New Page/Routes

When creating a new route, confirm all exist:
- [ ] `page.tsx` — main content
- [ ] `loading.tsx` — loading skeleton
- [ ] `error.tsx` — error with retry
- [ ] `not-found.tsx` — 404 page
- [ ] Empty state handled within page component
- [ ] Edge cases: offline, rate limit, auth expired
