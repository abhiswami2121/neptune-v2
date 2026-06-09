---
name: next-js-best-practices
description: App Router patterns, server vs client components, Server Actions, SEO metadata, and Next.js project conventions. Triggers on "Next.js", "app router", "server component", "client component", "server action", "RSC", "layout", "page", "middleware", "metadata", "SEO", "dynamic route", "generateStaticParams".
---

You are a Next.js App Router expert. You follow the latest Next.js patterns and conventions to build performant, maintainable applications.

## Server vs Client Components

### Server Components (Default)
Everything is a Server Component unless you explicitly mark it `"use client"`:
- Fetch data directly in the component with `async/await`
- Access databases, filesystem, and environment variables directly
- Keep sensitive logic on the server
- No hooks, no event handlers, no browser APIs

### Client Components (Opt-in)
Add `"use client"` directive at the top when you need:
- `useState`, `useEffect`, `useReducer`, `useContext`
- Event handlers (`onClick`, `onChange`, `onSubmit`)
- Browser APIs (`window`, `document`, `localStorage`, `navigator`)
- Custom hooks that use any of the above

**Rule**: Push client boundaries as deep as possible. A page can be a Server Component that imports a Client Component leaf node.

## Component Architecture

```
app/
  layout.tsx          # Root layout (Server) — wraps everything
  page.tsx            # Home page (Server or Client)
  error.tsx           # Error boundary (Client)
  not-found.tsx       # 404 page (Server or Client)
  loading.tsx         # Suspense fallback (Server or Client)
  globals.css         # Global styles
  
  (marketing)/        # Route group — shared layout without URL segment
    layout.tsx
    about/page.tsx
    pricing/page.tsx
    
  api/                # API routes
    chat/route.ts     # POST handler
    
  dashboard/          # Authenticated pages
    layout.tsx        # Auth check layout
    page.tsx          # Dashboard home
    [id]/page.tsx     # Dynamic route
    
  _lib/               # Private modules (not routable)  
    db.ts
    auth.ts
    
  _components/        # Private components (not routable)
    Navbar.tsx
```

## Data Fetching Patterns

### Server Component Fetching
```tsx
// page.tsx (Server Component)
async function getData() {
  const res = await fetch('https://api.example.com/data', {
    next: { revalidate: 3600 } // ISR: revalidate every hour
  });
  if (!res.ok) throw new Error('Failed to fetch');
  return res.json();
}

export default async function Page() {
  const data = await getData();
  return <DataDisplay data={data} />;
}
```

### Parallel Data Fetching
```tsx
export default async function Page() {
  const [user, posts, stats] = await Promise.all([
    getUser(),
    getPosts(),
    getStats(),
  ]);
  // ...
}
```

### Streaming with Suspense
```tsx
import { Suspense } from 'react';

export default function Page() {
  return (
    <div>
      <h1>Dashboard</h1>
      <Suspense fallback={<StatsSkeleton />}>
        <Stats />
      </Suspense>
      <Suspense fallback={<PostsSkeleton />}>
        <RecentPosts />
      </Suspense>
    </div>
  );
}
```

## Server Actions

Use Server Actions for form submissions and mutations:

```tsx
// app/actions.ts
"use server";
import { revalidatePath } from "next/cache";

export async function createPost(formData: FormData) {
  const title = formData.get("title");
  if (!title || typeof title !== "string") {
    return { error: "Title is required" };
  }
  await db.post.create({ data: { title } });
  revalidatePath("/posts");
  return { success: true };
}
```

In Client Components:
```tsx
"use client";
import { createPost } from "@/app/actions";

export function CreateForm() {
  return (
    <form action={createPost}>
      <input name="title" />
      <button type="submit">Create</button>
    </form>
  );
}
```

## Metadata & SEO

Every page should export metadata:

```tsx
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page Title | Neptune V2",
  description: "A compelling description for search engines",
  openGraph: {
    title: "Page Title",
    description: "...",
    images: ["/og-image.png"],
  },
};
```

Dynamic metadata:
```tsx
export async function generateMetadata({ params }): Promise<Metadata> {
  const post = await getPost(params.slug);
  return { title: post.title, description: post.excerpt };
}
```

## Performance Rules

1. **Use `<Link>` not `<a>`** — client-side navigation, prefetching
2. **Use `next/image`** — automatic optimization, lazy loading, WebP
3. **Use `next/font`** — no layout shift, self-hosted fonts
4. **Route groups** `(group)` — organize without affecting URLs
5. **Private folders** `_folder` — exclude from routing
6. **Parallel routes** `@modal` — complex layouts with slots
7. **Intercepting routes** `(.)folder` — modal overlays, in-context views

## Anti-Patterns to Avoid

❌ `useEffect` for data fetching in Client Components — use Server Components or SWR
❌ `"use client"` at the page level when only a leaf needs it
❌ Importing Server Components into Client Components (breaks RSC)
❌ Using `useRouter` for things `<Link>` can handle
❌ Large client-side bundles — use dynamic imports
❌ Blocking the entire page for one slow component — use Suspense
❌ Not handling loading/error states
