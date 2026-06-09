---
name: shadcn-ui-mastery
description: Canonical component usage, theme customization via CSS variables, dark mode patterns, and component composition. Triggers on "shadcn", "shadcn/ui", "ui component", "Button", "Dialog", "Dropdown", "theme", "dark mode", "CSS variables", "radix-ui", "component library".
---

You are a shadcn/ui expert. You build interfaces using shadcn/ui's component library with Radix UI primitives and CSS variable theming.

## Core Principles

1. **Every component is copy-pasted into your project** — not a dependency. You own the code.
2. **Built on Radix UI primitives** — accessible by default, WAI-ARIA compliant.
3. **Styled with Tailwind CSS + CSS variables** — fully customizable via CSS custom properties.
4. **Composable** — combine components freely, they work together.

## Adding Components

```bash
npx shadcn@latest add button card dialog dropdown-menu
```

Components are added to `@/components/ui/`. You can then customize them directly.

## Theme System

shadcn/ui uses CSS variables for theming. Variables are in `globals.css`:

```css
@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 222.2 84% 4.9%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    /* ... dark variants */
  }
}
```

**Rule**: Always use HSL values. Never use hex or rgb for theme variables.

## Dark Mode

```tsx
// providers/theme-provider.tsx
"use client";
import { ThemeProvider as NextThemesProvider } from "next-themes";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem>
      {children}
    </NextThemesProvider>
  );
}
```

Wrap root layout: `<ThemeProvider>{children}</ThemeProvider>`

Toggle with `useTheme()` from `next-themes`.

## Common Component Patterns

### Button
```tsx
<Button variant="default">Default</Button>
<Button variant="destructive">Delete</Button>
<Button variant="outline">Outline</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="link">Link</Button>
<Button size="sm">Small</Button>
<Button size="lg">Large</Button>
<Button size="icon"><SettingsIcon /></Button>
<Button loading>Submitting...</Button> {/* Neptune V2 custom */}
```

### Dialog (Modal)
```tsx
<Dialog>
  <DialogTrigger asChild>
    <Button variant="outline">Open</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Title</DialogTitle>
      <DialogDescription>Description here.</DialogDescription>
    </DialogHeader>
    {/* Content */}
    <DialogFooter>
      <Button type="submit">Save</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### Card
```tsx
<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
    <CardDescription>Description</CardDescription>
  </CardHeader>
  <CardContent>
    <p>Card content</p>
  </CardContent>
  <CardFooter>
    <Button>Action</Button>
  </CardFooter>
</Card>
```

### Form (with react-hook-form + zod)
```tsx
const formSchema = z.object({
  username: z.string().min(2).max(50),
});

type FormData = z.infer<typeof formSchema>;

export function ProfileForm() {
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { username: "" },
  });

  function onSubmit(values: FormData) {
    console.log(values);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Username</FormLabel>
              <FormControl>
                <Input placeholder="shadcn" {...field} />
              </FormControl>
              <FormDescription>Your public display name.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">Submit</Button>
      </form>
    </Form>
  );
}
```

### Toast / Sonner
```tsx
import { toast } from "sonner";

toast("Event has been created.");
toast.success("Success!");
toast.error("Something went wrong.");
toast.promise(saveData(), {
  loading: "Saving...",
  success: "Saved!",
  error: "Error saving",
});
```

## Composition Rules

1. **Always use the `asChild` prop** when composing with custom elements
2. **Don't fight the defaults** — shadcn patterns exist for a reason
3. **Style with className** — use Tailwind, not inline styles
4. **Keep components in `@/components/ui/`** — don't scatter shadcn components
5. **One component per file** — follow the existing file structure

## Anti-Patterns

❌ Importing components directly from `@radix-ui/react-*` — use the shadcn wrapper
❌ Removing the `cn()` utility — it merges Tailwind classes correctly
❌ Using raw HTML elements when a shadcn component exists
❌ Hardcoding colors — use theme variables: `bg-primary` not `bg-blue-500`
❌ Skipping `DialogTitle`/`DialogDescription` — required for accessibility
❌ Not handling loading states on buttons
