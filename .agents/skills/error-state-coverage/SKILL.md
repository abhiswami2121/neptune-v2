---
name: error-state-coverage
description: Every page must have error.tsx, not-found.tsx, and loading.tsx. Every async operation must handle errors gracefully. Triggers on "error", "error boundary", "not found", "loading", "error handling", "error state", "error page", "404", "500", "skeleton", "fallback", "empty state".
---

You ensure every page and component handles its error states. A page without error handling is incomplete. Users should never see a blank screen, infinite spinner, or cryptic stack trace.

## Required Files Per Route

Every route segment should have these files:

### 1. `error.tsx` (Client Component)
Catches runtime errors in the page and its children:

```tsx
"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Page error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-4">
      <AlertCircle className="h-12 w-12 text-destructive" />
      <div className="text-center">
        <h2 className="text-lg font-semibold">Something went wrong</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {error.message || "An unexpected error occurred"}
        </p>
      </div>
      <Button onClick={reset} variant="outline">
        Try again
      </Button>
    </div>
  );
}
```

### 2. `not-found.tsx`
Handles 404: resource not found:

```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FileQuestion } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-4">
      <FileQuestion className="h-12 w-12 text-muted-foreground" />
      <div className="text-center">
        <h2 className="text-lg font-semibold">Page not found</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
      </div>
      <Button asChild variant="outline">
        <Link href="/">Go home</Link>
      </Button>
    </div>
  );
}
```

### 3. `loading.tsx`
Shows while the page content loads:

```tsx
export default function Loading() {
  return (
    <div className="flex min-h-[400px] items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}
```

## Global Error Handling

### Root `app/error.tsx`
Catches errors from layouts and templates. Must be a Client Component.

### Root `app/global-error.tsx`  
Catches errors in the root layout itself. Replaces the entire HTML. Must include `<html>` and `<body>` tags:

```tsx
"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <div className="flex min-h-screen flex-col items-center justify-center gap-4">
          <h1 className="text-2xl font-bold">Something went wrong</h1>
          <button onClick={reset}>Try again</button>
        </div>
      </body>
    </html>
  );
}
```

## Component-Level Error Handling

Every async operation inside components should handle these states:

### Loading State
```tsx
if (isLoading) {
  return <Skeleton />; // or <LoadingSpinner />
}
```

### Empty State  
```tsx
if (!data || data.length === 0) {
  return <EmptyState
    icon={<Inbox className="h-12 w-12" />}
    title="No items found"
    description="Get started by creating your first item."
    action={<Button>Create Item</Button>}
  />;
}
```

### Error State
```tsx
if (error) {
  return <ErrorDisplay
    message={error.message}
    onRetry={() => refetch()}
  />;
}
```

### Success State
```tsx
return <DataDisplay data={data} />;
```

## API Route Error Handling

Every API route should return typed error responses:

```tsx
// app/api/example/route.ts
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const data = await fetchData();
    return NextResponse.json({ data });
  } catch (error) {
    console.error("GET /api/example error:", error);
    return NextResponse.json(
      { error: "Failed to fetch data", details: process.env.NODE_ENV === "development" ? String(error) : undefined },
      { status: 500 }
    );
  }
}
```

Error response shape:
```ts
type ApiError = {
  error: string;        // User-safe message
  details?: string;     // Dev-only (only in development)
  code?: string;        // Machine-readable error code
};
```

## Checklist Per Page/Route

- [ ] `error.tsx` exists with try-again button
- [ ] `not-found.tsx` exists with navigation home
- [ ] `loading.tsx` exists with spinner/skeleton
- [ ] Data fetch handles: loading, empty, error, success
- [ ] API routes return typed error responses
- [ ] No unhandled promise rejections
- [ ] Error messages are user-friendly (no stack traces in production)
- [ ] Retry/recovery actions available where sensible
