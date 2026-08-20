# 홈페이지 병합 (와이어프레임 × 디자인 가이드) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new, independently-running `app/` React site that implements the 5-screen "등기지킴이" wireframe (`wf/원룸 계약 사기 방지 와이어프레임.dc.html`) using the visual language defined in `design-guide/src/app/App.tsx` (colors, typography, radius).

**Architecture:** Standalone Vite + React 18 + TypeScript + Tailwind CSS v4 SPA at `app/`, routed with `react-router` v7. Shared shadcn/Radix UI primitives are copied from `design-guide/src/app/components/ui/` into `app/src/components/ui/` (two of them — `progress.tsx` and `badge.tsx` — get small, justified extensions). A single `Layout` component renders the header/nav and wraps all 5 pages via `<Outlet />`. No backend: all data (upload %, risk verdicts, checklist items, glossary terms) is static/local-state mock data matching the wireframe's example content.

**Tech Stack:** Vite 6.3.5, React 18.3.1, TypeScript (no type-check step, matching existing repo convention), Tailwind CSS v4 (`@tailwindcss/vite`), react-router 7.13.0, Radix UI primitives, class-variance-authority, lucide-react.

## Global Constraints

- New code lives entirely under `app/` — do not modify `design-guide/` or `wf/` (kept as style/wireframe references per the approved spec).
- No backend, no auth, no persistence, no real PDF analysis — everything is mock data or local React state (spec section "범위 밖").
- No automated test suite is being added (spec section 6 explicitly scopes this out). Every task instead verifies with `npm run build` (catches TS/JSX/import errors via esbuild) and the final task does a full manual browser pass.
- Brand primary = red `#C0404A` (hover `#A83540`, light `#FDECED`). Brand secondary = green `#2A8C5F` (hover `#22754E`, light `#E6F5EE`). These drive all general UI (nav, CTAs, links, progress, positive actions).
- Semantic Safe/Caution/Danger (`#059669` / `#D97706` / `#EF4444`, each with its own light bg + border) are a **separate palette reserved exclusively for the `/analyze/result` page** — never reused for brand/nav/CTA purposes, and never for the "위험/확인" tags shown on the Home page (those use brand red/green, matching the wireframe).
- Typography: `Nunito` (700/900) for display/headings/logo, `Noto Sans KR` (400/500/700) for body/UI text, `DM Mono` for numeric/code data. The wireframe's `Gaegu` sketch font is never carried into `app/`.
- Radius scale: sm 8px / md 12px / lg 16px, derived from a single `--radius: 1rem` base (matches design-guide's calc pattern).
- Package versions must match what's already proven working in `design-guide/package.json` (copy exact version numbers) to avoid dependency-resolution surprises.

---

### Task 1: Scaffold the `app/` Vite + React + TypeScript project

**Files:**
- Create: `app/package.json`
- Create: `app/vite.config.ts`
- Create: `app/index.html`
- Create: `app/src/main.tsx`
- Create: `app/src/App.tsx`
- Create: `.gitignore` (repo root)

**Interfaces:**
- Consumes: nothing (first task).
- Produces: a runnable Vite dev server at `app/`, with `@` aliased to `app/src`. `App.tsx` default-exports a component (placeholder for now — Task 4 replaces its contents with the router).

- [ ] **Step 1: Create `app/package.json`**

```json
{
  "name": "deunggi-jikimi-app",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "build": "vite build",
    "dev": "vite"
  },
  "dependencies": {
    "@radix-ui/react-accordion": "1.2.3",
    "@radix-ui/react-checkbox": "1.1.4",
    "@radix-ui/react-progress": "1.1.2",
    "@radix-ui/react-slot": "1.1.2",
    "class-variance-authority": "0.7.1",
    "clsx": "2.1.1",
    "lucide-react": "0.487.0",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "react-router": "7.13.0",
    "tailwind-merge": "3.2.0",
    "tw-animate-css": "1.3.8"
  },
  "devDependencies": {
    "@tailwindcss/vite": "4.1.12",
    "@vitejs/plugin-react": "4.7.0",
    "tailwindcss": "4.1.12",
    "vite": "6.3.5"
  }
}
```

- [ ] **Step 2: Create `app/vite.config.ts`**

```ts
import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

- [ ] **Step 3: Create `app/index.html`**

```html
<!DOCTYPE html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>등기지킴이</title>
    <style>html, body { height: 100%; margin: 0; } #root { height: 100%; }</style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 4: Create `app/src/main.tsx`**

```tsx
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./styles/index.css";

createRoot(document.getElementById("root")!).render(<App />);
```

Note: `./styles/index.css` doesn't exist yet — that's fine, it's created in Task 2 before this file is ever built against in a way that matters (Step 6 below installs deps and builds, so create a temporary empty `app/src/styles/index.css` in this task too, to keep this task's build green; Task 2 will overwrite it).

- [ ] **Step 4b: Create a temporary empty `app/src/styles/index.css`**

```css
/* replaced in Task 2 */
```

- [ ] **Step 5: Create `app/src/App.tsx` (placeholder — replaced in Task 4)**

```tsx
export default function App() {
  return <div style={{ padding: 24 }}>등기지킴이</div>;
}
```

- [ ] **Step 6: Create root `.gitignore`**

The repo currently has no root `.gitignore`, which is how `design-guide/node_modules` ended up committed by accident in a prior commit. Add one now so `app/node_modules` doesn't repeat that mistake.

```
node_modules/
dist/
```

- [ ] **Step 7: Install dependencies and verify the build**

Run:
```bash
cd app && npm install
```
Expected: exits 0, `app/node_modules` created.

Run:
```bash
npm run build
```
Expected: Vite prints `built in ...ms` with no errors, `app/dist/index.html` created.

- [ ] **Step 8: Verify the dev server serves the page**

Run:
```bash
npm run dev -- --port 5195 --strictPort &
sleep 1
curl -s -o /dev/null -w "%{http_code}" http://localhost:5195
kill %1
```
Expected: `200`.

- [ ] **Step 9: Commit**

```bash
cd ..
git add .gitignore app/package.json app/vite.config.ts app/index.html app/src/main.tsx app/src/App.tsx app/src/styles/index.css
git commit -m "scaffold app/ vite+react+ts project"
```

---

### Task 2: Design tokens — colors, fonts, radius

**Files:**
- Create: `app/src/styles/fonts.css`
- Create: `app/src/styles/tailwind.css`
- Modify: `app/src/styles/index.css` (replace placeholder from Task 1)
- Create: `app/src/styles/theme.css`

**Interfaces:**
- Consumes: nothing new.
- Produces: Tailwind utility classes available to every later task: `bg-brand-primary` / `hover:bg-brand-primary-hover` / `bg-brand-primary-light` / `text-brand-primary` / `border-brand-primary` (+ same set for `brand-secondary`), `bg-semantic-safe` / `bg-semantic-safe-bg` / `border-semantic-safe-border` (+ same set for `semantic-caution` and `semantic-danger`), plus standard shadcn slots `bg-primary`, `bg-background`, `text-foreground`, `bg-muted`, `text-muted-foreground`, `border-border`, `bg-destructive`, etc. Also `font-display` (Nunito), `font-sans` (Noto Sans KR, applied to `body` by default), `font-mono` (DM Mono).

- [ ] **Step 1: Create `app/src/styles/fonts.css`**

```css
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&family=Nunito:wght@700;900&family=DM+Mono:wght@400;500&display=swap');
```

- [ ] **Step 2: Create `app/src/styles/tailwind.css`**

```css
@import 'tailwindcss' source(none);
@source '../**/*.{js,ts,jsx,tsx}';

@import 'tw-animate-css';
```

- [ ] **Step 3: Replace `app/src/styles/index.css`**

```css
@import './fonts.css';
@import './tailwind.css';
@import './theme.css';
```

- [ ] **Step 4: Create `app/src/styles/theme.css`**

```css
@custom-variant dark (&:is(.dark *));

:root {
  --font-size: 16px;

  /* Brand — general UI (nav, CTAs, links, progress, positive actions) */
  --brand-primary: #C0404A;
  --brand-primary-hover: #A83540;
  --brand-primary-light: #FDECED;
  --brand-secondary: #2A8C5F;
  --brand-secondary-hover: #22754E;
  --brand-secondary-light: #E6F5EE;

  /* Semantic — reserved for /analyze/result only, independent of brand */
  --semantic-safe: #059669;
  --semantic-safe-bg: #ECFDF5;
  --semantic-safe-border: #A7F3D0;
  --semantic-caution: #D97706;
  --semantic-caution-bg: #FFFBEB;
  --semantic-caution-border: #FDE68A;
  --semantic-danger: #EF4444;
  --semantic-danger-bg: #FEF2F2;
  --semantic-danger-border: #FECACA;

  /* Neutral */
  --background: #FFFFFF;
  --foreground: #1A1A1A;
  --card: #FFFFFF;
  --card-foreground: #1A1A1A;
  --popover: #FFFFFF;
  --popover-foreground: #1A1A1A;
  --muted: #F5F5F5;
  --muted-foreground: #767676;
  --border: #E5E5E5;
  --input: transparent;
  --input-background: #FFFFFF;

  /* shadcn slot mapping — brand primary drives interactive elements */
  --primary: var(--brand-primary);
  --primary-foreground: #FFFFFF;
  --secondary: var(--brand-primary-light);
  --secondary-foreground: var(--brand-primary);
  --accent: var(--brand-primary-light);
  --accent-foreground: var(--brand-primary);
  --destructive: var(--semantic-danger);
  --destructive-foreground: #FFFFFF;
  --ring: var(--brand-primary);

  --radius: 1rem;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-input-background: var(--input-background);
  --color-ring: var(--ring);

  --color-brand-primary: var(--brand-primary);
  --color-brand-primary-hover: var(--brand-primary-hover);
  --color-brand-primary-light: var(--brand-primary-light);
  --color-brand-secondary: var(--brand-secondary);
  --color-brand-secondary-hover: var(--brand-secondary-hover);
  --color-brand-secondary-light: var(--brand-secondary-light);

  --color-semantic-safe: var(--semantic-safe);
  --color-semantic-safe-bg: var(--semantic-safe-bg);
  --color-semantic-safe-border: var(--semantic-safe-border);
  --color-semantic-caution: var(--semantic-caution);
  --color-semantic-caution-bg: var(--semantic-caution-bg);
  --color-semantic-caution-border: var(--semantic-caution-border);
  --color-semantic-danger: var(--semantic-danger);
  --color-semantic-danger-bg: var(--semantic-danger-bg);
  --color-semantic-danger-border: var(--semantic-danger-border);

  --radius-sm: calc(var(--radius) - 8px);
  --radius-md: calc(var(--radius) - 4px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);

  --font-sans: 'Noto Sans KR', system-ui, sans-serif;
  --font-display: 'Nunito', 'Noto Sans KR', sans-serif;
  --font-mono: 'DM Mono', ui-monospace, monospace;
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }

  html {
    font-size: var(--font-size);
  }

  body {
    @apply bg-background text-foreground font-sans;
  }
}
```

- [ ] **Step 5: Verify the build**

Run:
```bash
cd app && npm run build
```
Expected: succeeds with no errors (Tailwind must parse the new `@theme inline` block without complaint).

- [ ] **Step 6: Commit**

```bash
cd ..
git add app/src/styles
git commit -m "add app/ design tokens (brand + semantic colors, typography, radius scale)"
```

---

### Task 3: Shared UI primitives (copy + extend from design-guide)

**Files:**
- Create: `app/src/components/ui/utils.ts`
- Create: `app/src/components/ui/button.tsx`
- Create: `app/src/components/ui/card.tsx`
- Create: `app/src/components/ui/input.tsx`
- Create: `app/src/components/ui/checkbox.tsx`
- Create: `app/src/components/ui/accordion.tsx`
- Create: `app/src/components/ui/badge.tsx` (extended with `success`/`warning` variants)
- Create: `app/src/components/ui/progress.tsx` (extended with `indicatorClassName` prop)

**Interfaces:**
- Consumes: color tokens from Task 2 (`bg-primary`, `bg-semantic-safe`, `bg-semantic-caution`, `bg-muted`, etc.).
- Produces (named exports later tasks import by exact name):
  - `cn(...inputs: ClassValue[]): string` from `./utils`
  - `Button`, `buttonVariants` from `./button` — `Button` accepts `variant?: "default"|"destructive"|"outline"|"secondary"|"ghost"|"link"`, `size?: "default"|"sm"|"lg"|"icon"`, `asChild?: boolean`
  - `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`, `CardAction` from `./card`
  - `Input` from `./input`
  - `Checkbox` from `./checkbox` — accepts `checked?: boolean`, `onCheckedChange?: (checked: boolean | "indeterminate") => void`
  - `Accordion`, `AccordionItem`, `AccordionTrigger`, `AccordionContent` from `./accordion`
  - `Badge`, `badgeVariants` from `./badge` — `Badge` accepts `variant?: "default"|"secondary"|"destructive"|"outline"|"success"|"warning"`
  - `Progress` from `./progress` — accepts `value?: number` and `indicatorClassName?: string`

- [ ] **Step 1: Create `app/src/components/ui/utils.ts`**

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 2: Create `app/src/components/ui/button.tsx`**

```tsx
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "./utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "border bg-background text-foreground hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9 rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
```

- [ ] **Step 3: Create `app/src/components/ui/card.tsx`**

```tsx
import * as React from "react";

import { cn } from "./utils";

function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "bg-card text-card-foreground flex flex-col gap-6 rounded-xl border",
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 pt-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        className,
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <h4
      data-slot="card-title"
      className={cn("leading-none", className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <p
      data-slot="card-description"
      className={cn("text-muted-foreground", className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className,
      )}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-6 [&:last-child]:pb-6", className)}
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-6 pb-6 [.border-t]:pt-6", className)}
      {...props}
    />
  );
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
};
```

- [ ] **Step 4: Create `app/src/components/ui/input.tsx`**

```tsx
import * as React from "react";

import { cn } from "./utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex h-9 w-full min-w-0 rounded-md border px-3 py-1 text-base bg-input-background transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
```

- [ ] **Step 5: Create `app/src/components/ui/checkbox.tsx`**

```tsx
"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { CheckIcon } from "lucide-react";

import { cn } from "./utils";

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer border bg-input-background dark:bg-input/30 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground dark:data-[state=checked]:bg-primary data-[state=checked]:border-primary focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive size-4 shrink-0 rounded-[4px] border shadow-xs transition-shadow outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-current transition-none"
      >
        <CheckIcon className="size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
```

Note: this is unchanged from design-guide. Per-instance checked-color overrides (e.g. brand green on the checklist page) are done by passing `className="data-[state=checked]:bg-brand-secondary data-[state=checked]:border-brand-secondary"` at the call site — `cn()`'s `twMerge` resolves the conflict with the base classes above in favor of the passed-in ones.

- [ ] **Step 6: Create `app/src/components/ui/accordion.tsx`**

```tsx
"use client";

import * as React from "react";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { ChevronDownIcon } from "lucide-react";

import { cn } from "./utils";

function Accordion({
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Root>) {
  return <AccordionPrimitive.Root data-slot="accordion" {...props} />;
}

function AccordionItem({
  className,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Item>) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn("border-b last:border-b-0", className)}
      {...props}
    />
  );
}

function AccordionTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Trigger>) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          "focus-visible:border-ring focus-visible:ring-ring/50 flex flex-1 items-start justify-between gap-4 rounded-md py-4 text-left text-sm font-medium transition-all outline-none hover:underline focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 [&[data-state=open]>svg]:rotate-180",
          className,
        )}
        {...props}
      >
        {children}
        <ChevronDownIcon className="text-muted-foreground pointer-events-none size-4 shrink-0 translate-y-0.5 transition-transform duration-200" />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

function AccordionContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Content>) {
  return (
    <AccordionPrimitive.Content
      data-slot="accordion-content"
      className="data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down overflow-hidden text-sm"
      {...props}
    >
      <div className={cn("pt-0 pb-4", className)}>{children}</div>
    </AccordionPrimitive.Content>
  );
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
```

- [ ] **Step 7: Create `app/src/components/ui/badge.tsx` (extended)**

```tsx
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "./utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive:
          "border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        success:
          "border-transparent bg-semantic-safe text-white [a&]:hover:bg-semantic-safe/90",
        warning:
          "border-transparent bg-semantic-caution text-white [a&]:hover:bg-semantic-caution/90",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span";

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
```

`success` (Safe) and `warning` (Caution) are new — the design-guide original only had a 2-color danger/neutral set, but the spec's semantic system needs all three states (`/analyze/result` uses `destructive` for Danger and `success` for Safe).

- [ ] **Step 8: Create `app/src/components/ui/progress.tsx` (extended)**

```tsx
"use client";

import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";

import { cn } from "./utils";

function Progress({
  className,
  value,
  indicatorClassName,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & {
  indicatorClassName?: string;
}) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        "bg-muted relative h-2 w-full overflow-hidden rounded-full",
        className,
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn("bg-primary h-full w-full flex-1 transition-all", indicatorClassName)}
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
```

Two changes from design-guide's original: the track background is `bg-muted` instead of `bg-primary/20` (a red-tinted track would look wrong under a green indicator), and it accepts `indicatorClassName` so callers can render the indicator in brand green instead of the default red primary — used on `/analyze` and `/checklist`.

- [ ] **Step 9: Verify the build**

Run:
```bash
cd app && npm run build
```
Expected: succeeds with no errors. (Nothing imports these components yet, but this catches TypeScript/JSX syntax mistakes in the files themselves since Vite still type-strips and bundles anything reachable — if unreachable files aren't checked by `vite build` alone, that's fine, correctness is fully re-verified once Task 4+ imports them.)

- [ ] **Step 10: Commit**

```bash
cd ..
git add app/src/components/ui
git commit -m "add shared shadcn/radix ui primitives to app/"
```

---

### Task 4: Shared layout, router shell, and page placeholders

**Files:**
- Create: `app/src/components/Layout.tsx`
- Modify: `app/src/App.tsx` (replace Task 1 placeholder)
- Create: `app/src/pages/Home.tsx` (placeholder — filled in Task 5)
- Create: `app/src/pages/Analyze.tsx` (placeholder — filled in Task 6)
- Create: `app/src/pages/AnalyzeResult.tsx` (placeholder — filled in Task 7)
- Create: `app/src/pages/Checklist.tsx` (placeholder — filled in Task 8)
- Create: `app/src/pages/Glossary.tsx` (placeholder — filled in Task 9)

**Interfaces:**
- Consumes: nothing from Task 3 directly (Layout only needs `react-router`'s `Link`/`Outlet`/`useLocation`).
- Produces: working client-side routing across `/`, `/analyze`, `/analyze/result`, `/checklist`, `/glossary`, all wrapped in the shared header. Later tasks (5–9) only touch their own page file.

- [ ] **Step 1: Create `app/src/components/Layout.tsx`**

```tsx
import { Link, Outlet, useLocation } from "react-router";

const NAV_ITEMS = [
  { label: "등기부 분석", to: "/analyze" },
  { label: "계약 체크리스트", to: "/checklist" },
  { label: "용어사전", to: "/glossary" },
];

export default function Layout() {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <header className="flex items-center gap-6 border-b border-border px-6 py-3">
        <Link to="/" className="font-display text-lg font-extrabold text-brand-primary">
          등기지킴이
        </Link>
        <nav className="flex gap-5 text-sm text-muted-foreground">
          {NAV_ITEMS.map((item) => {
            const isActive = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={
                  isActive
                    ? "border-b-2 border-foreground pb-0.5 font-bold text-foreground"
                    : "hover:text-foreground"
                }
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <button
          type="button"
          className="ml-auto rounded-full border border-foreground px-4 py-1.5 text-sm"
        >
          로그인
        </button>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
```

(The "로그인" button is a plain `<button>`, not a route — the wireframe shows it purely as UI chrome and login isn't in scope.)

- [ ] **Step 2: Replace `app/src/App.tsx`**

```tsx
import { BrowserRouter, Routes, Route } from "react-router";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import Analyze from "./pages/Analyze";
import AnalyzeResult from "./pages/AnalyzeResult";
import Checklist from "./pages/Checklist";
import Glossary from "./pages/Glossary";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/analyze" element={<Analyze />} />
          <Route path="/analyze/result" element={<AnalyzeResult />} />
          <Route path="/checklist" element={<Checklist />} />
          <Route path="/glossary" element={<Glossary />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 3: Create placeholder page files**

`app/src/pages/Home.tsx`:
```tsx
export default function Home() {
  return <div className="p-6">Home</div>;
}
```

`app/src/pages/Analyze.tsx`:
```tsx
export default function Analyze() {
  return <div className="p-6">Analyze</div>;
}
```

`app/src/pages/AnalyzeResult.tsx`:
```tsx
export default function AnalyzeResult() {
  return <div className="p-6">AnalyzeResult</div>;
}
```

`app/src/pages/Checklist.tsx`:
```tsx
export default function Checklist() {
  return <div className="p-6">Checklist</div>;
}
```

`app/src/pages/Glossary.tsx`:
```tsx
export default function Glossary() {
  return <div className="p-6">Glossary</div>;
}
```

- [ ] **Step 4: Verify the build**

Run:
```bash
cd app && npm run build
```
Expected: succeeds with no errors.

- [ ] **Step 5: Verify routing works**

Run:
```bash
npm run dev -- --port 5195 --strictPort &
sleep 1
for p in / /analyze /analyze/result /checklist /glossary; do
  echo -n "$p -> "; curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:5195$p"
done
kill %1
```
Expected: `200` for all five paths (Vite's dev server serves `index.html` for any SPA path).

- [ ] **Step 6: Commit**

```bash
cd ..
git add app/src/App.tsx app/src/components/Layout.tsx app/src/pages
git commit -m "add app/ router shell, shared layout, and page placeholders"
```

---

### Task 5: Home page (`/`)

**Files:**
- Modify: `app/src/pages/Home.tsx` (replace Task 4 placeholder)

**Interfaces:**
- Consumes: `Link` from `react-router`; `Button` from `@/components/ui/button`; `Card`, `CardContent` from `@/components/ui/card`.
- Produces: nothing consumed by other tasks (leaf page).

- [ ] **Step 1: Replace `app/src/pages/Home.tsx`**

```tsx
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const STEPS = [
  { n: "1", title: "서류 올리기", desc: "등기부등본 PDF 업로드" },
  { n: "2", title: "자동 분석", desc: "권리관계·시세 대조" },
  { n: "3", title: "위험 리포트", desc: "항목별 판정과 대처법" },
];

const RISKS = [
  { level: "위험", text: "깡통전세 · 전세가율 90% 이상" },
  { level: "위험", text: "이중계약 · 대리인 위임장 위조" },
  { level: "사례", text: "신탁등기 물건 계약" },
];

const SAFE_TIPS = [
  { level: "확인", text: "전입신고 + 확정일자" },
  { level: "확인", text: "등기부 = 집주인 = 계좌주 일치" },
  { level: "확인", text: "전세보증금 반환보증 가입" },
];

export default function Home() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <section className="grid grid-cols-1 gap-8 border-b border-border pb-10 md:grid-cols-[1fr_280px]">
        <div className="flex flex-col gap-4">
          <h1 className="font-display text-3xl font-extrabold leading-snug md:text-4xl">
            계약서에 도장 찍기 전,
            <br />
            <span className="text-brand-primary">30초 만에 위험 확인</span>
          </h1>
          <p className="text-muted-foreground">
            등기부등본을 올리면 근저당·가압류·전세가율을 자동으로 짚어드립니다.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button asChild size="lg" className="bg-brand-primary hover:bg-brand-primary-hover">
              <Link to="/analyze">등기부등본 분석하기</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/checklist">체크리스트 먼저 보기</Link>
            </Button>
          </div>
        </div>
        <div className="flex min-h-[160px] items-center justify-center rounded-lg border border-dashed border-border bg-muted text-sm text-muted-foreground">
          일러스트 / 이미지 자리
        </div>
      </section>

      <section className="border-b border-border py-10">
        <h2 className="mb-4 font-display text-lg font-bold">이렇게 확인합니다</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {STEPS.map((step) => (
            <Card key={step.n} className="border-border">
              <CardContent className="pt-6">
                <p className="font-bold">
                  {step.n} · {step.title}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{step.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-8 py-10 md:grid-cols-2">
        <div>
          <h2 className="mb-3 font-display text-lg font-bold">요즘 많이 당하는 수법</h2>
          <ul className="flex flex-col gap-2">
            {RISKS.map((risk, i) => (
              <li
                key={i}
                className={
                  risk.level === "위험"
                    ? "flex items-center gap-2 rounded-md border-l-4 border-brand-primary bg-brand-primary-light px-3 py-2 text-sm"
                    : "flex items-center gap-2 rounded-md border-l-4 border-border bg-muted px-3 py-2 text-sm"
                }
              >
                <span
                  className={
                    risk.level === "위험" ? "font-bold text-brand-primary" : "text-muted-foreground"
                  }
                >
                  {risk.level}
                </span>
                <span>{risk.text}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="mb-3 font-display text-lg font-bold">사회초년생 필수 3가지</h2>
          <ul className="flex flex-col gap-2">
            {SAFE_TIPS.map((tip, i) => (
              <li
                key={i}
                className="flex items-center gap-2 rounded-md border-l-4 border-brand-secondary bg-brand-secondary-light px-3 py-2 text-sm"
              >
                <span className="font-bold text-brand-secondary">{tip.level}</span>
                <span>{tip.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Verify the build**

Run: `cd app && npm run build`
Expected: succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
cd ..
git add app/src/pages/Home.tsx
git commit -m "implement app/ home page"
```

---

### Task 6: Analyze page (`/analyze`)

**Files:**
- Modify: `app/src/pages/Analyze.tsx` (replace Task 4 placeholder)

**Interfaces:**
- Consumes: `Link` from `react-router`; `Progress` from `@/components/ui/progress` (props: `value`, `indicatorClassName`, from Task 3); `Button` from `@/components/ui/button`.
- Produces: nothing consumed by other tasks (leaf page). Links forward to `/analyze/result` as a demo shortcut (no real analysis logic exists).

- [ ] **Step 1: Replace `app/src/pages/Analyze.tsx`**

```tsx
import { Link } from "react-router";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";

const CHECK_ITEMS = [
  "소유자 정보와 변동 이력",
  "근저당권 · 채권최고액",
  "가압류 · 경매 · 신탁",
  "전세가율 (시세 대조)",
  "임차권등기명령",
];

export default function Analyze() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <ol className="mb-8 flex items-center gap-2 text-sm text-muted-foreground">
        <li className="rounded-full bg-foreground px-3 py-1 text-background">1 업로드</li>
        <li>→</li>
        <li className="rounded-full border border-border px-3 py-1">2 분석</li>
        <li>→</li>
        <li className="rounded-full border border-border px-3 py-1">3 결과</li>
      </ol>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_260px]">
        <div className="flex flex-col gap-4">
          <h1 className="font-display text-xl font-bold">등기부등본을 올려주세요</h1>
          <div className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted px-6 py-10 text-center">
            <p className="font-bold">여기로 파일을 끌어다 놓기</p>
            <p className="text-sm text-muted-foreground">PDF · 인터넷등기소 열람본 (10MB 이하)</p>
            <Button variant="outline" className="mt-2">
              파일 선택
            </Button>
          </div>

          <div className="rounded-lg border border-border p-4">
            <div className="flex items-center justify-between text-sm">
              <span>등기부등본_역삼동.pdf</span>
              <span className="text-brand-secondary">분석 중 62%</span>
            </div>
            <Progress value={62} className="mt-3" indicatorClassName="bg-brand-secondary" />
            <p className="mt-2 text-xs text-muted-foreground">권리관계 항목 대조 중 · 예상 20초</p>
          </div>

          <div className="border-t border-border pt-4">
            <p className="mb-2 font-bold">서류가 없다면</p>
            <div className="flex gap-3">
              <Button variant="outline">주소로 조회하기</Button>
              <Button variant="outline">발급 방법 안내</Button>
            </div>
          </div>
        </div>

        <div className="h-fit rounded-lg border border-border p-4">
          <p className="mb-2 font-bold">무엇을 확인하나요</p>
          <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
            {CHECK_ITEMS.map((item) => (
              <li key={item}>· {item}</li>
            ))}
          </ul>
          <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
            업로드한 파일은 분석 후 즉시 삭제됩니다.
          </p>
          <Button asChild className="mt-4 w-full bg-brand-primary hover:bg-brand-primary-hover">
            <Link to="/analyze/result">결과 보기 (데모)</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the build**

Run: `cd app && npm run build`
Expected: succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
cd ..
git add app/src/pages/Analyze.tsx
git commit -m "implement app/ analyze (upload/progress) page"
```

---

### Task 7: Analyze Result page (`/analyze/result`)

**Files:**
- Modify: `app/src/pages/AnalyzeResult.tsx` (replace Task 4 placeholder)

**Interfaces:**
- Consumes: `Badge` from `@/components/ui/badge` (variants `destructive`/`success`, from Task 3); `Button` from `@/components/ui/button`.
- Produces: nothing consumed by other tasks (leaf page). This is the only page using the `semantic-*` color tokens.

- [ ] **Step 1: Replace `app/src/pages/AnalyzeResult.tsx`**

```tsx
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const RISK_ITEMS = [
  {
    level: "danger" as const,
    title: "전세가율 108%",
    desc: "시세 2.4억 · 채권최고액 1.6억 + 보증금 1.0억. 경매 시 보증금 회수가 어렵습니다.",
  },
  { level: "danger" as const, title: "근저당권 설정 (2건)" },
  { level: "danger" as const, title: "소유권 이전 3개월 이내" },
  { level: "safe" as const, title: "가압류 · 경매 기입등기 없음" },
  { level: "safe" as const, title: "신탁등기 없음 · 소유자 명의 일치" },
];

const LEVEL_STYLE = {
  danger: {
    badge: "destructive" as const,
    label: "위험",
    border: "border-semantic-danger-border",
    bg: "bg-semantic-danger-bg",
  },
  safe: {
    badge: "success" as const,
    label: "정상",
    border: "border-semantic-safe-border",
    bg: "bg-semantic-safe-bg",
  },
};

export default function AnalyzeResult() {
  const dangerCount = RISK_ITEMS.filter((i) => i.level === "danger").length;

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <p className="mb-4 text-sm text-muted-foreground">
        서울 강남구 역삼동 ○○빌라 302호 · 2026.08.20 분석
      </p>

      <div className="mb-8 flex items-center gap-5 rounded-lg border-2 border-semantic-danger bg-semantic-danger-bg p-6">
        <div className="flex h-24 w-24 shrink-0 flex-col items-center justify-center rounded-full border-4 border-semantic-danger text-semantic-danger">
          <span className="font-display text-2xl font-extrabold">위험</span>
          <span className="text-xs">{dangerCount}/5 항목</span>
        </div>
        <div>
          <h1 className="font-display text-xl font-extrabold text-semantic-danger">
            계약 전 반드시 확인이 필요합니다
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            채권최고액과 보증금 합계가 시세의 <strong>108%</strong>입니다. 보증금을 돌려받지 못할 가능성이 큽니다.
          </p>
          <div className="mt-3 flex gap-2">
            <Button className="bg-semantic-danger text-white hover:bg-semantic-danger/90">
              대처 방법 보기
            </Button>
            <Button variant="outline">PDF로 저장</Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_220px]">
        <div className="flex flex-col gap-3">
          <h2 className="font-display font-bold">항목별 판정</h2>
          {RISK_ITEMS.map((item) => {
            const style = LEVEL_STYLE[item.level];
            return (
              <div key={item.title} className={`rounded-lg border p-3 ${style.border} ${style.bg}`}>
                <div className="flex items-center gap-2">
                  <Badge variant={style.badge}>{style.label}</Badge>
                  <span className="font-bold">{item.title}</span>
                </div>
                {"desc" in item && item.desc && (
                  <p className="mt-1.5 text-sm text-muted-foreground">{item.desc}</p>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex flex-col gap-3">
          <div className="rounded-lg border border-border p-3">
            <p className="mb-2 text-sm font-bold">지금 할 일</p>
            <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
              <li>1. 집주인에게 근저당 말소 요구</li>
              <li>2. 특약사항에 조건 명시</li>
              <li>3. 보증보험 가입 가능 여부 확인</li>
            </ul>
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="mb-1 text-sm font-bold">전문가 상담</p>
            <p className="text-xs text-muted-foreground">공인중개사 · 법률 상담 연결</p>
            <Button variant="outline" className="mt-2 w-full">
              상담 신청
            </Button>
          </div>
          <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
            본 결과는 참고용이며 법적 효력이 없습니다.
          </p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the build**

Run: `cd app && npm run build`
Expected: succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
cd ..
git add app/src/pages/AnalyzeResult.tsx
git commit -m "implement app/ analyze result (risk report) page"
```

---

### Task 8: Checklist page (`/checklist`)

**Files:**
- Modify: `app/src/pages/Checklist.tsx` (replace Task 4 placeholder)

**Interfaces:**
- Consumes: `Checkbox` from `@/components/ui/checkbox` (props `checked`, `onCheckedChange`, from Task 3); `Progress` from `@/components/ui/progress`; `Button` from `@/components/ui/button`; React's `useState`.
- Produces: nothing consumed by other tasks (leaf page). Checkbox state is local-only (no persistence), matching spec scope.

- [ ] **Step 1: Replace `app/src/pages/Checklist.tsx`**

```tsx
import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";

const STAGES = ["집 보러 가기 전", "계약 당일", "잔금 · 입주", "입주 후"];

type ChecklistItem = { id: string; label: string; note?: string; required?: boolean };

const STAGE_ITEMS: Record<string, ChecklistItem[]> = {
  "집 보러 가기 전": [
    {
      id: "issued",
      label: "등기부등본을 직접 발급받았다",
      note: "중개인이 보여주는 사본은 날짜가 오래됐을 수 있습니다.",
      required: true,
    },
    {
      id: "priceCompared",
      label: "시세와 보증금을 비교했다",
      note: "전세가율 80% 이상이면 재검토하세요.",
      required: true,
    },
    { id: "brokerChecked", label: "중개사무소 등록번호를 조회했다" },
    { id: "condition", label: "채광 · 수압 · 곰팡이 · 방음을 확인했다" },
    { id: "fees", label: "관리비 항목과 공과금 부담 주체를 물었다" },
  ],
  "계약 당일": [{ id: "contract-1", label: "계약서 특약사항을 확인했다" }],
  "잔금 · 입주": [{ id: "balance-1", label: "잔금 지급 전 등기부를 재열람했다" }],
  "입주 후": [{ id: "after-1", label: "전입신고와 확정일자를 받았다" }],
};

export default function Checklist() {
  const [activeStage, setActiveStage] = useState(STAGES[0]);
  const [checked, setChecked] = useState<Record<string, boolean>>({ brokerChecked: true });

  const allItems = Object.values(STAGE_ITEMS).flat();
  const doneCount = allItems.filter((item) => checked[item.id]).length;
  const items = STAGE_ITEMS[activeStage];

  return (
    <div className="mx-auto grid max-w-4xl grid-cols-1 gap-0 px-6 py-10 md:grid-cols-[180px_1fr]">
      <aside className="flex flex-col gap-1.5 border-b border-border pb-6 md:border-b-0 md:border-r md:pr-4 md:pb-0">
        <p className="mb-1 text-sm font-bold">진행 단계</p>
        {STAGES.map((stage) => (
          <button
            key={stage}
            type="button"
            onClick={() => setActiveStage(stage)}
            className={
              stage === activeStage
                ? "rounded-md bg-foreground px-3 py-2 text-left text-sm text-background"
                : "rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-muted"
            }
          >
            {stage}
          </button>
        ))}
        <div className="mt-4 border-t border-border pt-3">
          <p className="text-xs text-muted-foreground">
            전체 진행률 {doneCount}/{allItems.length}
          </p>
          <Progress
            value={(doneCount / allItems.length) * 100}
            className="mt-2"
            indicatorClassName="bg-brand-secondary"
          />
        </div>
      </aside>

      <div className="flex flex-col gap-3 md:pl-6">
        <h1 className="font-display text-lg font-bold">{activeStage}</h1>
        <p className="text-sm text-muted-foreground">체크한 내용은 저장되고, PDF로 뽑아 갈 수 있습니다.</p>

        {items.map((item) => {
          const isChecked = !!checked[item.id];
          return (
            <label
              key={item.id}
              className={
                isChecked
                  ? "flex items-start gap-3 rounded-lg border border-brand-secondary-light bg-brand-secondary-light p-3"
                  : item.required
                    ? "flex items-start gap-3 rounded-lg border border-brand-primary-light bg-brand-primary-light p-3"
                    : "flex items-start gap-3 rounded-lg border border-border p-3"
              }
            >
              <Checkbox
                checked={isChecked}
                onCheckedChange={(value) =>
                  setChecked((prev) => ({ ...prev, [item.id]: value === true }))
                }
                className="mt-0.5 data-[state=checked]:border-brand-secondary data-[state=checked]:bg-brand-secondary"
              />
              <div>
                <p className={isChecked ? "text-sm text-muted-foreground line-through" : "text-sm font-bold"}>
                  {item.label} {item.required && <span className="text-brand-primary">필수</span>}
                </p>
                {item.note && <p className="mt-1 text-xs text-muted-foreground">{item.note}</p>}
              </div>
            </label>
          );
        })}

        <div className="mt-auto flex gap-3 pt-4">
          <Button className="bg-brand-secondary hover:bg-brand-secondary-hover">다음 단계로</Button>
          <Button variant="outline">체크리스트 인쇄</Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the build**

Run: `cd app && npm run build`
Expected: succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
cd ..
git add app/src/pages/Checklist.tsx
git commit -m "implement app/ contract checklist page"
```

---

### Task 9: Glossary page (`/glossary`)

**Files:**
- Modify: `app/src/pages/Glossary.tsx` (replace Task 4 placeholder)

**Interfaces:**
- Consumes: `Input` from `@/components/ui/input`; `Badge` from `@/components/ui/badge` (variants `destructive`/`success`); `Accordion`, `AccordionItem`, `AccordionTrigger`, `AccordionContent` from `@/components/ui/accordion`; React's `useState`.
- Produces: nothing consumed by other tasks (leaf page). Includes the "사기 사례" (fraud cases) content as a sidebar section on this page, per the spec's GNB reconciliation (3 nav items, not 4).

- [ ] **Step 1: Replace `app/src/pages/Glossary.tsx`**

```tsx
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";

type Term = { term: string; tag?: "위험 신호" | "꼭 챙기기"; desc: string };

const TERMS: Term[] = [
  {
    term: "근저당권",
    tag: "위험 신호",
    desc: "집을 담보로 빌린 돈이 있다는 표시입니다. 채권최고액이 실제 빌린 금액보다 크게 적히며, 경매로 넘어가면 이 금액이 내 보증금보다 먼저 변제됩니다.",
  },
  { term: "확정일자", tag: "꼭 챙기기", desc: "임대차 계약서에 확정일자를 받으면 그 날짜를 기준으로 우선변제권이 생깁니다." },
  { term: "대항력", desc: "전입신고와 인도를 마치면 제3자에게 임차권을 주장할 수 있는 힘이 생깁니다." },
  { term: "신탁등기", tag: "위험 신호", desc: "소유권이 신탁회사에 있는 경우로, 수탁자의 동의 없이 계약하면 무효가 될 수 있습니다." },
  { term: "전세가율", desc: "매매 시세 대비 전세보증금의 비율입니다. 높을수록 보증금을 돌려받기 어려워집니다." },
];

const FRAUD_CASES = [
  "대리인이 위임장을 위조한 경우",
  "한 집에 세입자 두 명을 받은 경우",
  "잔금 후 소유권을 넘긴 경우",
];

export default function Glossary() {
  const [query, setQuery] = useState("");
  const filtered = TERMS.filter((t) => t.term.includes(query) || t.desc.includes(query));

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="mb-4 font-display text-xl font-bold">모르는 말은 계약 전에 물어보세요</h1>
      <Input
        placeholder="궁금한 용어 검색 (예: 근저당, 확정일자)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mb-8"
      />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_240px]">
        <Accordion type="single" collapsible>
          {filtered.map((t) => (
            <AccordionItem key={t.term} value={t.term}>
              <AccordionTrigger>
                <span className="flex items-center gap-2">
                  <span className="font-bold">{t.term}</span>
                  {t.tag && (
                    <Badge variant={t.tag === "위험 신호" ? "destructive" : "success"}>{t.tag}</Badge>
                  )}
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <p className="text-sm text-muted-foreground">{t.desc}</p>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-brand-primary bg-brand-primary-light p-4">
            <p className="mb-2 text-sm font-bold text-brand-primary">실제 사기 사례</p>
            <ul className="flex flex-col gap-1.5 text-xs text-muted-foreground">
              {FRAUD_CASES.map((c) => (
                <li key={c}>· {c}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-border p-4">
            <p className="mb-1 text-sm font-bold">피해를 당했다면</p>
            <p className="text-xs text-muted-foreground">
              전세피해지원센터 · 임차권등기명령 · 보증이행 청구 절차 안내
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the build**

Run: `cd app && npm run build`
Expected: succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
cd ..
git add app/src/pages/Glossary.tsx
git commit -m "implement app/ glossary and fraud-cases page"
```

---

### Task 10: Final integration verification

**Files:** none (verification only).

**Interfaces:**
- Consumes: the complete `app/` from Tasks 1–9.
- Produces: nothing (terminal task).

- [ ] **Step 1: Full production build**

Run:
```bash
cd app && npm run build
```
Expected: succeeds, `app/dist/` contains `index.html` and hashed JS/CSS assets.

- [ ] **Step 2: Start the dev server and open it in a browser**

Run:
```bash
npm run dev -- --port 5195 --strictPort &
```
Open `http://localhost:5195` in a browser (use the project's browser preview tool if running inside Claude Code).

- [ ] **Step 3: Manually verify each route**

For each of `/`, `/analyze`, `/analyze/result`, `/checklist`, `/glossary`, confirm:
- The header shows the "등기지킴이" logo in red (`brand-primary`) and Nunito font, GNB has exactly 3 items, and the active page's nav item is bold/underlined.
- Buttons/links styled as primary actions are red; "다음 단계로" and progress bars are green.
- On `/analyze/result` only: the risk badges/backgrounds use the semantic Danger/Safe colors (a more saturated red/green than the brand colors elsewhere).
- On `/checklist`: clicking a checkbox toggles its checked state and the "전체 진행률" bar/count updates; clicking a different stage in the left rail switches the item list.
- On `/glossary`: typing in the search input filters the term list; clicking a term expands its accordion content.
- No console errors (check devtools console).

- [ ] **Step 4: Stop the dev server**

```bash
kill %1
```

- [ ] **Step 5: Final commit (only if Step 3 required fixes)**

If any fixes were needed during manual verification:
```bash
git add app
git commit -m "fix issues found during app/ integration verification"
```

If no fixes were needed, this task requires no commit — Tasks 1–9 already captured all the work.
