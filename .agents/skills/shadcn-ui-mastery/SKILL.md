---
name: shadcn-ui-mastery
description: Canonical shadcn/ui component usage, theme customization via CSS variables, dark mode patterns, form handling with react-hook-form, and composition patterns. Triggers on "shadcn", "shadcn/ui", "ui component", "button component", "dialog", "dropdown", "form component", "toast", "sheet", "command palette", "theme", "dark mode", "CSS variables", "radix ui".
---

You are a shadcn/ui expert. Every UI component uses canonical shadcn/ui patterns with proper theming and accessibility.

## Component Architecture

shadcn/ui components live in `components/ui/` and are built on Radix UI primitives:

```
components/
├── ui/
│   ├── button.tsx
│   ├── dialog.tsx
│   ├── dropdown-menu.tsx
│   ├── form.tsx
│   ├── input.tsx
│   └── ...
├── settings-form.tsx  ← compositions
└── user-nav.tsx       ← compositions
```

## Import Pattern

Always import from the local component registry:

```tsx
// ✅ Correct
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// ❌ Wrong — never import Radix directly for basic components
import * as Dialog from "@radix-ui/react-dialog";
```

## Adding Components

```bash
npx shadcn-ui@latest add button dialog form
```

## Theming with CSS Variables

shadcn/ui uses CSS custom properties for theming. Define in `app/globals.css`:

```css
@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 222.2 84% 4.9%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 11.2%;
    /* ... complete dark theme tokens */
  }
}
```

**Rule**: Always add new theme tokens to both `:root` and `.dark` blocks. Never hardcode colors.

## Dark Mode

Use `next-themes` for dark mode:

```tsx
// components/theme-provider.tsx
"use client";
import { ThemeProvider } from "next-themes";

export function Providers({ children }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      {children}
    </ThemeProvider>
  );
}
```

## Form Pattern (react-hook-form + zod)

```tsx
"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const formSchema = z.object({
  username: z.string().min(2).max(50),
  email: z.string().email(),
});

export function SettingsForm() {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { username: "", email: "" },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    console.log(values);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Username</FormLabel>
              <FormControl>
                <Input placeholder="shadcn" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">Save</Button>
      </form>
    </Form>
  );
}
```

## Common Component Patterns

### Dialog/Modal
```tsx
<Dialog open={isOpen} onOpenChange={setIsOpen}>
  <DialogTrigger asChild><Button>Open</Button></DialogTrigger>
  <DialogContent>
    <DialogHeader><DialogTitle>Title</DialogTitle></DialogHeader>
  </DialogContent>
</Dialog>
```

### Dropdown Menu
```tsx
<DropdownMenu>
  <DropdownMenuTrigger><Button>Menu</Button></DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuItem>Profile</DropdownMenuItem>
    <DropdownMenuSeparator />
    <DropdownMenuItem>Log out</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

### Toast Notifications
```tsx
import { toast } from "sonner";
toast.success("Settings saved!");
toast.error("Failed to save");
```

## Composition: Never Modify UI Components Directly

Instead of modifying `components/ui/button.tsx`, compose:

```tsx
// ✅ Create a wrapper
export function SubmitButton({ children, ...props }) {
  return <Button variant="default" size="lg" className="w-full" {...props}>{children}</Button>;
}
```

## Responsive Patterns

Use Tailwind breakpoints with shadcn:
```tsx
<DialogContent className="sm:max-w-[425px] lg:max-w-[600px]">
<SheetContent side="bottom" className="h-[80vh] sm:h-auto sm:max-w-md">
```

## Do NOT

- ❌ Modify shadcn source files in `components/ui/`
- ❌ Use Radix components directly (use the wrapper)
- ❌ Hardcode colors — always use `bg-primary`, `text-foreground`, etc.
- ❌ Forget to add both light and dark variants for custom styles
- ❌ Use `@radix-ui` imports in page components
