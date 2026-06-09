---
name: next-js-best-practices
description: Next.js App Router canonical patterns — server vs client components, Server Actions, route handlers, middleware, ISR, SEO metadata, image optimization, and streaming. Triggers on "Next.js", "nextjs", "app router", "server component", "client component", "server action", "route handler", "middleware", "ISR", "SSR", "SSG", "generateMetadata", "layout.tsx", "page.tsx", "loading.tsx", "error.tsx", "not-found.tsx", "streaming", "RSC".
---

You are a Next.js App Router expert. Every new page, component, and API route follows canonical Next.js patterns.

## Server vs Client Components

### Server Components (default)

All components are Server Components by default. Use for:
- Data fetching (async components)
- Database queries
- Sensitive logic (tokens, API keys)
- Heavy dependencies (keep them server-side)
- SEO-critical content

```tsx
// app/users/page.tsx — Server Component
async function UsersPage() {
  const users = await db.user.findMany(); // runs on server
  return <UserList users={users} />;
}
```

### Client Components (opt-in)

Add `"use client"` directive when you need:
- `useState`, `useEffect`, `useReducer`
- Event handlers (`onClick`, `onChange`)
- Browser APIs (`localStorage`, `window`, `navigator`)
- Custom hooks that use any of the above
- Third-party client-side libraries

```tsx
"use client";
import { useState } from "react";
export function SearchInput() {
  const [query, setQuery] = useState("");
  return <input value={query} onChange={(e) => setQuery(e.target.value)} />;
}
```

**Rule**: Push client boundary as deep as possible. Parent stays server, child goes client.

## Server Actions

Use Server Actions for form submissions and mutations:

```tsx
// app/actions/create-user.ts
"use server";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function createUser(formData: FormData) {
  const name = formData.get("name") as string;
  await db.user.create({ data: { name } });
  revalidatePath("/users");
}
```

**Server Action Rules**:
- Always mark with `"use server"` directive
- Validate inputs server-side (don't trust client)
- Use `revalidatePath()` or `revalidateTag()` to refresh data
- Handle errors gracefully, return structured responses
- Never expose sensitive data in return values

## Route Handlers

```tsx
// app/api/chat/route.ts
export async function POST(req: Request) {
  const body = await req.json();
  return Response.json({ result: "ok" });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const page = searchParams.get("page") || "1";
  return Response.json({ page });
}
```

**Route Handler Rules**:
- Export named functions: GET, POST, PUT, PATCH, DELETE
- Always validate the request body
- Return proper HTTP status codes
- Use `Response.json()` for JSON responses
- Set appropriate cache headers

## Middleware

```tsx
// middleware.ts (at project root)
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
```

**Middleware Rules**:
- Runs on Edge Runtime (limited APIs)
- Use for auth, redirects, A/B testing, bot protection
- Keep it fast — runs on every request
- Use `matcher` config to limit scope

## SEO & Metadata

```tsx
// app/layout.tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "My App", template: "%s | My App" },
  description: "Best app ever",
  metadataBase: new URL("https://myapp.com"),
};

// app/users/page.tsx
export async function generateMetadata({ params }): Promise<Metadata> {
  return {
    title: `User ${params.id}`,
    description: `Profile of user ${params.id}`,
  };
}
```

**SEO Rules**:
- Every page has a unique `<title>` and `<meta description>`
- Use `generateMetadata` for dynamic pages
- Include `opengraph-image.tsx` for social sharing
- Use `metadataBase` for absolute URLs
- Add `robots.ts` and `sitemap.ts` for indexing

## Error States (Mandatory)

Every route segment MUST have these files:

```tsx
// app/users/loading.tsx — shown while page loads
export default function Loading() {
  return <UsersSkeleton />;
}

// app/users/error.tsx — shown when error occurs
"use client";
export default function Error({ error, reset }) {
  return (
    <div>
      <h2>Something went wrong</h2>
      <button onClick={reset}>Try again</button>
    </div>
  );
}

// app/users/not-found.tsx — shown for 404
export default function NotFound() {
  return <div>Page not found</div>;
}
```

## Data Fetching Patterns

```tsx
// Parallel data fetching (preferred when independent)
async function Page() {
  const [users, posts] = await Promise.all([
    db.user.findMany(),
    db.post.findMany(),
  ]);
  return <Content users={users} posts={posts} />;
}

// Sequential (when data depends on previous result)
async function UserPage({ params }) {
  const user = await db.user.findUnique({ where: { id: params.id } });
  const posts = await db.post.findMany({ where: { userId: user.id } });
}
```

## Image Optimization

```tsx
import Image from "next/image";
// Always use next/image, never raw <img>
<Image src="/hero.jpg" alt="Hero" width={1200} height={600} priority />
```

## Streaming

```tsx
import { Suspense } from "react";
// Stream components independently
<Suspense fallback={<Loading />}>
  <SlowComponent />
</Suspense>
```

## Anti-Patterns

- ❌ `"use client"` at page level when only one child needs it
- ❌ Fetching in `useEffect` when you can fetch in Server Component
- ❌ Passing functions to Client Components via props (use Server Actions)
- ❌ Using `window`/`document` in Server Components
- ❌ Large client-side bundles from heavy libraries
