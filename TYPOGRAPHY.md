# RMIS 2.0 — Typography Reference

> Exact typography specification for cloning this system. Everything below is
> extracted from `src/app/layout.tsx` and `src/app/globals.css` (V9 Bevel design
> system). Copy the code blocks as-is to reproduce identical type rendering.

---

## 1. Font Families

### Loaded web fonts (`next/font/google`)

Only **one** web font is actually rendered: **Inter** (substitute for SF Pro /
PP Radio Grotesk per the design spec).

```ts
// src/app/layout.tsx
import { Inter, DM_Sans } from "next/font/google";

// Dialog type system: Inter for body/UI; DM Sans (PP Radio Grotesk substitute,
// light geometric grotesque) for display headings.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const radio = DM_Sans({
  variable: "--font-radio",
  subsets: ["latin"],
  weight: ["400"],
});

// Applied on <body>:
// <body className={`${inter.variable} ${radio.variable} antialiased bg-background text-foreground`}>
```

| Font | CSS Variable | Subsets | Weights | Status |
|------|-------------|---------|---------|--------|
| **Inter** | `--font-inter` | latin | 400, 500, 600 (in use) | ✅ Active — body, UI, display |
| DM Sans | `--font-radio` | latin | 400 | ⚠️ Loaded but **not referenced** in CSS (legacy variable only) |

### The font stack (exact, used everywhere)

```css
font-family: -apple-system, BlinkMacSystemFont, var(--font-inter), "Segoe UI", ui-sans-serif, system-ui, sans-serif;
```

**What actually renders per platform:**

| Platform | Rendered font |
|----------|--------------|
| macOS / iOS / iPadOS | **SF Pro** (via `-apple-system` / `BlinkMacSystemFont`) |
| Windows | **Segoe UI** |
| Android / Linux / anything else | **Inter** (self-hosted via next/font, always cached) |

Design intent: SF Pro system typography carries every interface layer — 600-weight
display text with tight `-0.03em` tracking; 400-weight body; 500-weight
navigation/actions.

### Tailwind theme binding

```css
/* src/app/globals.css — @theme inline */
--font-sans: -apple-system, BlinkMacSystemFont, var(--font-inter), "Segoe UI", ui-sans-serif, system-ui, sans-serif;
--font-display: -apple-system, BlinkMacSystemFont, var(--font-inter), "Segoe UI", ui-sans-serif, system-ui, sans-serif;
```

Both `font-sans` and `font-display` resolve to the **same stack** — there is no
separate display family in the final system.

---

## 2. Global Body Settings

```css
/* src/app/globals.css — @layer base */
body {
  @apply bg-background text-foreground;
  font-family: -apple-system, BlinkMacSystemFont, var(--font-inter), "Segoe UI", ui-sans-serif, system-ui, sans-serif;
  letter-spacing: -0.01em;                                  /* global optical tightening */
  font-feature-settings: "blwf", "cv03", "cv04", "cv09";    /* Inter alternate glyphs */
}
```

- `antialiased` is applied via the `<body>` className in `layout.tsx`.
- Global `letter-spacing: -0.01em` applies to **all** text unless overridden.
- `font-feature-settings` enables Inter's alternate `a`, `g`, and `l` forms
  (`cv03`, `cv04`, `cv09`) plus balanced ligatures (`blwf`).

**Default base size:** Tailwind `text-sm` (14px) dominates UI density — the
app is built on the **14px / 12px** rhythm (see §5 usage stats).

---

## 3. Type Scale — Design Spec (reference)

From `upload/PROPOSED-RMIS-DESIGN.md`:

| Role | Family | Weight | Size | Line Height | Letter Spacing | Token |
|------|--------|--------|------|-------------|----------------|-------|
| caption | -apple-system | 400 | 12px | 1.1 | 0 | `--text-caption` |
| nav | -apple-system | 500 | 16px | 1.4 | 0 | `--text-nav` |
| brand-nav | -apple-system | 500 | 18px | 1.4 | 0.162px | `--text-brand-nav` |
| body | -apple-system | 400 | 24px | 1.3 | 0 | `--text-body` |
| section-label | -apple-system | 600 | 24px | 0.9 | -0.24px | `--text-section-label` |
| card-heading | -apple-system | 600 | 40px | 1 | -1.2px | `--text-card-heading` |
| display | -apple-system | 600 | 64px | 1 | -1.92px | `--text-display` |
| hero-display | -apple-system | 600 | 80px | 1 | -2.4px | `--text-hero-display` |

**Weights used in the system: 400 (regular), 500 (medium), 600 (semibold) — nothing heavier.**

---

## 4. Custom Typography Classes (exact CSS)

Copy these into `globals.css` for an identical clone.

### Display & headings

```css
/* Dialog typography helpers — Ink 600 display with tight Bevel tracking */
.font-display {
  font-family: -apple-system, BlinkMacSystemFont, var(--font-inter), "Segoe UI", ui-sans-serif, system-ui, sans-serif;
  font-weight: 600;
  letter-spacing: -0.03em;
}
.text-display-hero {
  font-family: -apple-system, BlinkMacSystemFont, var(--font-inter), "Segoe UI", ui-sans-serif, system-ui, sans-serif;
  font-weight: 600;
  font-size: clamp(42px, 6.5vw, 74px);
  line-height: 1;
  letter-spacing: -0.03em;
  color: #222326;
}
.text-heading-lg {
  font-family: -apple-system, BlinkMacSystemFont, var(--font-inter), "Segoe UI", ui-sans-serif, system-ui, sans-serif;
  font-weight: 600;
  font-size: clamp(32px, 4vw, 50px);
  line-height: 1.05;
  letter-spacing: -0.03em;
  color: #222326;
}
.text-heading-md {
  font-family: -apple-system, BlinkMacSystemFont, var(--font-inter), "Segoe UI", ui-sans-serif, system-ui, sans-serif;
  font-weight: 600;
  font-size: clamp(24px, 3vw, 32px);
  line-height: 1.1;
  letter-spacing: -0.02em;
  color: #222326;
}
```

| Class | Weight | Size | Line height | Tracking | Ink |
|-------|--------|------|-------------|----------|-----|
| `.font-display` | 600 | inherits | inherits | −0.03em | inherits |
| `.text-display-hero` | 600 | 42→74px fluid | 1 | −0.03em | Ink `#222326` |
| `.text-heading-lg` | 600 | 32→50px fluid | 1.05 | −0.03em | Ink `#222326` |
| `.text-heading-md` | 600 | 24→32px fluid | 1.1 | −0.02em | Ink `#222326` |

### Gradient ink (display moments only)

```css
.grad-ink {
  background: linear-gradient(120deg, #222326 30%, #3f4553 60%, #4a5568 90%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: transparent;
}
.grad-ember {
  background: linear-gradient(120deg, #2f3fbe, #415eee 55%, #8b97f5);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: transparent;
}
```

### Micro-labels, numerals, monograms

```css
/* Institutional micro-label — 11px caps */
.eyebrow {
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

/* Monogram chip text */
.monogram {
  font-weight: 600;
  letter-spacing: 0.02em;
}

/* Numeric emphasis — tabular figures for KPIs/metrics */
.num {
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}
```

### Status pills & table headers

```css
.status-pill {
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
}

/* Hairline table micro-label anatomy — enforced on every table */
.table-card thead th {
  border-bottom: 1px solid var(--border);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--stone); /* #5d6067 */
}
```

### Buttons

```css
.dlg-cta, .dlg-ghost {
  font-weight: 500;   /* both CTA and ghost buttons */
}
```

### Rich-text content (job descriptions etc.)

```css
.rich-text p, .rich-text ul, .rich-text ol { line-height: 1.6; }
.rich-text strong { color: #222326; font-weight: 500; }
.rich-text a { color: #222326; text-decoration: underline; text-underline-offset: 2px; }
```

### Sonner toasts (restyle)

```css
[data-sonner-toast] {
  font-family: -apple-system, BlinkMacSystemFont, var(--font-inter), "Segoe UI", ui-sans-serif, system-ui, sans-serif !important;
}
[data-sonner-toast] [data-title] {
  font-size: 13px;
  font-weight: 500;
  letter-spacing: -0.01em;
}
[data-sonner-toast] [data-description] {
  font-size: 12px;
  color: #5d6067;
}
```

---

## 5. Actual Utility Usage (in-code distribution)

Measured across `src/components/{shell,views,ui}` — this is the de-facto working
scale of the app:

### Text sizes

| Class | Size | Uses | Primary role |
|-------|------|------|--------------|
| `text-sm` | 14px | 335 | Default UI text, inputs, buttons, table cells |
| `text-xs` | 12px | 217 | Captions, meta, labels, badges |
| `text-base` | 16px | 32 | Emphasized body, nav items |
| `text-lg` | 18px | 30 | Card titles (small) |
| `text-xl` | 20px | 28 | Card titles, section heads |
| `text-2xl` | 24px | 13 | Page titles |
| `text-3xl` | 30px | 8 | Page titles (large) |
| `text-4xl` | 36px | 1 | One-off large heading |

### Font weights

| Class | Weight | Uses |
|-------|--------|------|
| `font-medium` | 500 | 176 |
| `font-semibold` | 600 | 106 |
| `font-normal` | 400 | 7 |

### Tracking

| Class | Value | Uses |
|-------|-------|------|
| `tracking-wide` | +0.025em | 7 (uppercase micro-labels) |

**Summary: the app's working rhythm is 14px/500–600 primary, 12px/500 meta,
600 weight for all headings, with fluid clamp() classes for hero/display.**

---

## 6. Ink Colors Used With Type

| Token | Hex | Role |
|-------|-----|------|
| Ink | `#222326` | Headings, strong body (`--color-ink`, `--foreground`) |
| Graphite | `#4a4d57` | Secondary text |
| Stone | `#5d6067` | Table headers, muted labels |
| Body gray / Pebble | `#666a72` | Body copy (5.4:1 on white — WCAG AA) |
| Ash | `#8d939e` | Placeholder, faintest text |
| Metric Blue | `#415eee` | Links/accents, focus outline |

---

## 7. Clone Checklist (step-by-step)

1. **`layout.tsx`** — add the `Inter` (+ optionally `DM_Sans`) `next/font/google`
   config exactly as in §1, attach variables to `<body>`, keep `antialiased`.
2. **`globals.css` `@theme inline`** — set `--font-sans` and `--font-display`
   to the exact stack from §1.
3. **`globals.css` `@layer base`** — apply body rules from §2 (font-family,
   `letter-spacing: -0.01em`, `font-feature-settings: "blwf","cv03","cv04","cv09"`).
4. **Copy utility classes** from §4 verbatim: `.font-display`,
   `.text-display-hero`, `.text-heading-lg`, `.text-heading-md`, `.grad-ink`,
   `.grad-ember`, `.eyebrow`, `.monogram`, `.num`, `.status-pill`,
   `.table-card thead th`, `.dlg-cta`, `.dlg-ghost`, `.rich-text`, Sonner restyle.
5. **Use the working scale** from §5: `text-sm` + `font-medium`/`font-semibold`
   as the default; `text-xs` for meta; `.eyebrow` (11px caps, +0.08em) for
   institutional labels; `.num` for KPIs; clamp() display classes for hero.
6. **Weights ceiling: 600.** Never use 700+ — the system stops at semibold.
