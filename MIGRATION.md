# UX4G Design System 3.0 — Migration Guide

> **For:** Government departments, vendors, and development teams migrating from Bootstrap, Tailwind CSS, or Material UI to UX4G Design System 3.0.
>
> **Package:** `ux4g-web-components` (npm) | **CDN:** `cdn.ux4g.gov.in` | **Docs:** `doc.ux4g.gov.in`

---

## Table of Contents

1. [Overview](#overview)
2. [Before You Start](#before-you-start)
3. [Installation](#installation)
4. [Migration Strategy](#migration-strategy)
5. [Migrating from Bootstrap 5](#migrating-from-bootstrap-5)
6. [Migrating from Tailwind CSS](#migrating-from-tailwind-css)
7. [Migrating from Material UI](#migrating-from-material-ui)
8. [Color System Migration](#color-system-migration)
9. [Dark Mode Migration](#dark-mode-migration)
10. [Responsive Design Migration](#responsive-design-migration)
11. [Component Migration](#component-migration)
12. [Accessibility Compliance](#accessibility-compliance)
13. [Common Challenges & Solutions](#common-challenges--solutions)
14. [Common Pitfalls & Solutions](#common-pitfalls--solutions)
15. [Global CSS Reset Behavior](#global-css-reset-behavior)
16. [Import Order (Critical)](#import-order-critical)
17. [Framework-Specific Notes](#framework-specific-notes)
18. [Brand Theming](#brand-theming)
19. [Accessibility Widget Integration](#accessibility-widget-integration)
20. [Verification Checklist](#verification-checklist)
21. [Migration Do's and Don'ts](#migration-dos-and-donts-quick-reference)
22. [Support & Resources](#support--resources)

---

## Overview

### What is UX4G DS 3.0?

UX4G (User Experience for Government) is India's official design system for government digital services. It provides:

- **53 ready-to-use components** (Button, Modal, Card, Accordion, Table, Select, Combobox, etc.)
- **36 utility modules** (spacing, typography, flexbox, grid, colors, ring, outline, divide, scroll, line-clamp, effects, etc.)
- **57 citizen journey patterns** (Identity, Payment, Dashboard, Notifications, and more)
- **Design tokens** as CSS custom properties (`--ux4g-*`)
- **Multi-framework support** — React, Angular, HTML/CSS, Flutter
- **WCAG 2.1 AA accessibility** built into every component
- **Automatic dark mode** via semantic token system
- **RTL support** for Urdu and other right-to-left languages

### Why Migrate?

Per Government of India directive, all digital public services under DigitalIndia Corporation and NeGD must adopt UX4G DS 3.0 for:

- Consistent citizen experience across 2,500+ government websites
- Mandatory accessibility compliance (RPwD Act 2016)
- Unified theming and branding
- Reduced development time and maintenance cost

---

## Before You Start

### Prerequisites

- Node.js 16+ (18+ recommended)
- npm, yarn, or pnpm package manager
- Your project running on React, Angular, or plain HTML/CSS
- Familiarity with CSS custom properties (CSS variables)

### Understand the Naming Convention

UX4G uses a consistent `ux4g-` prefix for ALL utility classes:

| Category | Pattern | Example |
|----------|---------|---------|
| Display | `ux4g-d-{value}` | `ux4g-d-flex`, `ux4g-grid`, `ux4g-d-none` |
| Flex direction | `ux4g-flex-{value}` | `ux4g-flex-row`, `ux4g-flex-column` |
| Align items | `ux4g-ai-{value}` | `ux4g-ai-center`, `ux4g-ai-start` |
| Justify content | `ux4g-jc-{value}` | `ux4g-jc-between`, `ux4g-jc-center` |
| Padding | `ux4g-p{side}-{size}` | `ux4g-px-m`, `ux4g-py-xl`, `ux4g-pt-2xl` |
| Margin | `ux4g-m{side}-{size}` | `ux4g-mb-l`, `ux4g-mt-xl` |
| Font size | `ux4g-fs-{px}` | `ux4g-fs-14`, `ux4g-fs-16`, `ux4g-fs-24` |
| Font weight | `ux4g-fw-{name}` | `ux4g-fw-bold`, `ux4g-fw-semibold` |
| Border radius | `ux4g-radius-{size}` | `ux4g-radius-s`, `ux4g-radius-m`, `ux4g-radius-full` |
| Text color | `ux4g-text-{semantic}` | `ux4g-text-white`, `ux4g-text-success`, `ux4g-text-error` |
| Background | `ux4g-bg-{semantic}` | `ux4g-bg-primary`, `ux4g-bg-success-subtle` |
| Border | `ux4g-border-{semantic}` | `ux4g-border-success`, `ux4g-border-error` |
| Gap | `ux4g-gap-{size}` | `ux4g-gap-4xs`, `ux4g-gap-xs`, `ux4g-gap-m` |
| Width | `ux4g-w-{value}` | `ux4g-w-100` (100%), `ux4g-w-auto` |
| Responsive | `ux4g-{bp}-{utility}` | `ux4g-sm-d-flex`, `ux4g-lg-jc-between` |

### Spacing Scale

UX4G uses a semantic spacing scale (not pixel numbers):

| Token | Size | Equivalent |
|-------|------|------------|
| `none` | 0px | — |
| `3xs` | 2px | — |
| `2xs` | 4px | Tailwind p-1 |
| `xs` | 8px | Tailwind p-2 / Bootstrap p-2 |
| `s` | 16px | Tailwind p-4 / Bootstrap p-3 |
| `m` | 24px | Tailwind p-6 / Bootstrap p-4 |
| `l` | 32px | Tailwind p-8 / Bootstrap p-5 |
| `xl` | 40px | Tailwind p-10 |
| `2xl` | 48px | Tailwind p-12 |

---

## Installation

### Option 1: npm/pnpm/yarn (Recommended)

```bash
# npm
npm install ux4g-web-components

# pnpm
pnpm add ux4g-web-components

# yarn
yarn add ux4g-web-components
```

Then import in your entry file:

```js
// React (main.tsx or App.tsx)
import 'ux4g-web-components/styles.css';
import 'ux4g-web-components/design-system';

// Angular (angular.json)
{
  "styles": ["node_modules/ux4g-web-components/styles/ux4g.css"],
  "scripts": ["node_modules/ux4g-web-components/dist/runtime/design-system.js"]
}
```

### Option 2: CDN (No build tooling required)

```html
<!-- CSS -->
<link rel="stylesheet" href="https://cdn.ux4g.gov.in/UX4G@3.2.0/index.css">

<!-- JavaScript Runtime -->
<script src="https://cdn.ux4g.gov.in/UX4G@3.2.0/ux4g.js"></script>

<!-- Accessibility Widget -->
<script src="https://cdn.ux4g.gov.in/accessibility-v3.22/accessibility-widget.js"></script>
```

---

## Migration Strategy

### Recommended Approach: Incremental Migration

Do NOT attempt to migrate everything at once. Follow this phased approach:

**Phase 1 — Setup & Coexistence (Day 1)**
- Install `ux4g-web-components`
- Import the CSS alongside your existing framework
- Verify no class name conflicts
- Both systems work simultaneously

**Phase 2 — New Features on UX4G (Week 1-2)**
- Build all NEW pages/components using UX4G classes
- Establish team familiarity with the naming convention
- Create internal mapping cheat sheet

**Phase 3 — Migrate Components (Week 2-4)**
- Replace buttons, cards, modals, alerts with UX4G components
- Migrate color classes to semantic tokens
- Remove dark mode overrides (UX4G handles automatically)

**Phase 4 — Migrate Utilities (Week 4-6)**
- Replace layout utilities (flex, grid, spacing)
- Replace typography utilities
- Replace responsive classes

**Phase 5 — Remove Old Framework (Week 6-8)**
- Uninstall Bootstrap/Tailwind/Material
- Remove old CSS imports
- Run final audit

### Migration Priority Order

1. **Colors** — Biggest visual impact, enables dark mode
2. **Components** — Buttons, cards, modals, alerts
3. **Layout** — Flex, grid, display
4. **Spacing** — Padding, margin, gap
5. **Typography** — Font size, weight, line-height
6. **Responsive** — Breakpoint variants
7. **States** — Hover, focus, active

---

## Migrating from Bootstrap 5

### Class Name Mapping

| Bootstrap 5 | UX4G | Notes |
|---|---|---|
| `d-flex` | `ux4g-d-flex` | Same concept, different prefix |
| `d-none` | `ux4g-d-none` | |
| `d-block` | `ux4g-d-block` | |
| `d-grid` | `ux4g-grid` | Note: NOT `ux4g-d-grid` (renamed in v2.0.0+) |
| `d-md-flex` | `ux4g-md-d-flex` | Breakpoint prefix position differs |
| `d-lg-none` | `ux4g-lg-d-none` | |
| `flex-row` | `ux4g-flex-row` | |
| `flex-column` | `ux4g-flex-column` | |
| `flex-wrap` | `ux4g-flex-wrap` | |
| `justify-content-between` | `ux4g-jc-between` | Shortened |
| `justify-content-center` | `ux4g-jc-center` | |
| `align-items-center` | `ux4g-ai-center` | |
| `align-items-start` | `ux4g-ai-start` | |
| `align-self-center` | `ux4g-as-center` | |
| `p-0` through `p-5` | `ux4g-p-none` through `ux4g-p-l` | Semantic names instead of numbers |
| `px-3` | `ux4g-px-s` (16px) | Map by pixel value, not number |
| `py-4` | `ux4g-py-m` (24px) | |
| `mt-3` | `ux4g-mt-s` (16px) | |
| `mb-4` | `ux4g-mb-m` (24px) | |
| `gap-3` | `ux4g-gap-6xs` (16px) or `ux4g-gap-xs` (24px) | Use token-based gap |
| `text-center` | `ux4g-text-center` | |
| `text-start` | `ux4g-text-start` | |
| `fw-bold` | `ux4g-fw-bold` | Same name! |
| `fw-semibold` | `ux4g-fw-semibold` | |
| `fs-1` through `fs-6` | `ux4g-fs-48` through `ux4g-fs-14` | Pixel-based instead of numbered |
| `rounded` | `ux4g-radius-m` | Named scale |
| `rounded-pill` | `ux4g-radius-full` | |
| `shadow-sm` | `ux4g-shadow-l1` | Named levels |
| `shadow-lg` | `ux4g-shadow-l3` | |
| `overflow-hidden` | `ux4g-o-hidden` | |
| `overflow-auto` | `ux4g-o-auto` | |
| `position-relative` | `ux4g-relative` | |
| `position-absolute` | `ux4g-absolute` | |
| `order-first` | `ux4g-order-first` | |
| `visually-hidden` | `ux4g-sr-only` | Screen reader only |
| `visible` | `ux4g-visible` | |
| `invisible` | `ux4g-invisible` | |
| `opacity-50` | `ux4g-opacity-50` | |
| `cursor-pointer` | `ux4g-cursor-pointer` | |

### Bootstrap Grid → UX4G Grid

```html
<!-- Bootstrap -->
<div class="row">
  <div class="col-md-6">Left</div>
  <div class="col-md-6">Right</div>
</div>

<!-- UX4G -->
<div class="ux4g-grid ux4g-md-grid-cols-2 ux4g-gap-xs">
  <div>Left</div>
  <div>Right</div>
</div>
```

### Bootstrap Components → UX4G Components

```html
<!-- Bootstrap Button -->
<button class="btn btn-primary btn-lg">Submit</button>

<!-- UX4G Button -->
<button class="ux4g-btn ux4g-btn-primary ux4g-btn-lg">Submit</button>
```

```html
<!-- Bootstrap Card -->
<div class="card">
  <div class="card-body">
    <h5 class="card-title">Title</h5>
    <p class="card-text">Content</p>
  </div>
</div>

<!-- UX4G Card -->
<div class="ux4g-card">
  <div class="ux4g-card-body">
    <h5 class="ux4g-card-title">Title</h5>
    <p>Content</p>
  </div>
</div>
```

---

## Migrating from Tailwind CSS

### Class Name Mapping

| Tailwind | UX4G | Notes |
|---|---|---|
| `flex` | `ux4g-d-flex` | |
| `inline-flex` | `ux4g-d-inline-flex` | |
| `grid` | `ux4g-grid` | Note: NOT `ux4g-d-grid` |
| `hidden` | `ux4g-d-none` | |
| `block` | `ux4g-d-block` | |
| `flex-row` | `ux4g-flex-row` | |
| `flex-col` | `ux4g-flex-column` | |
| `flex-wrap` | `ux4g-flex-wrap` | |
| `flex-1` | `ux4g-flex-1` | |
| `flex-none` | `ux4g-flex-none` | |
| `grow` | `ux4g-flex-grow-1` | |
| `shrink-0` | `ux4g-flex-shrink-0` | |
| `items-center` | `ux4g-ai-center` | |
| `items-start` | `ux4g-ai-start` | |
| `justify-between` | `ux4g-jc-between` | |
| `justify-center` | `ux4g-jc-center` | |
| `gap-4` (16px) | `ux4g-gap-6xs` | Map by pixel value |
| `gap-6` (24px) | `ux4g-gap-xs` | |
| `gap-8` (32px) | `ux4g-gap-s` | |
| `space-y-4` | `ux4g-space-y-4` | Same number suffix |
| `space-x-3` | `ux4g-space-x-3` | |
| `p-4` (16px) | `ux4g-p-s` | Map by pixel value |
| `p-6` (24px) | `ux4g-p-m` | |
| `p-8` (32px) | `ux4g-p-l` | |
| `px-4` | `ux4g-px-s` | |
| `py-6` | `ux4g-py-m` | |
| `mt-4` | `ux4g-mt-s` | |
| `mb-8` | `ux4g-mb-l` | |
| `w-full` | `ux4g-w-100` | |
| `h-full` | `ux4g-h-100` | |
| `min-h-screen` | `ux4g-min-h-screen` | |
| `max-w-7xl` | `ux4g-max-w-7xl` | Same name! |
| `text-sm` (14px) | `ux4g-fs-14` | |
| `text-base` (16px) | `ux4g-fs-16` | |
| `text-lg` (18px) | `ux4g-fs-18` | |
| `text-xl` (20px) | `ux4g-fs-20` | |
| `text-2xl` (24px) | `ux4g-fs-24` | |
| `font-bold` | `ux4g-fw-bold` | |
| `font-semibold` | `ux4g-fw-semibold` | |
| `font-medium` | `ux4g-fw-medium` | |
| `leading-tight` | `ux4g-leading-tight` | |
| `leading-relaxed` | `ux4g-leading-relaxed` | |
| `tracking-tight` | `ux4g-tracking-tight` | |
| `text-center` | `ux4g-text-center` | |
| `uppercase` | `ux4g-text-uppercase` | |
| `truncate` | `ux4g-line-clamp-1` | |
| `line-clamp-2` | `ux4g-line-clamp-2` | |
| `rounded-lg` | `ux4g-radius-l` | |
| `rounded-full` | `ux4g-radius-full` | |
| `rounded-xl` | `ux4g-radius-xl` | |
| `border` | `ux4g-bb` (bottom) or use semantic class | |
| `shadow-md` | `ux4g-shadow-l2` | |
| `shadow-lg` | `ux4g-shadow-l3` | |
| `opacity-50` | `ux4g-opacity-50` | |
| `z-10` | `ux4g-z-10` | |
| `z-50` | `ux4g-z-50` | |
| `overflow-hidden` | `ux4g-o-hidden` | |
| `overflow-auto` | `ux4g-o-auto` | |
| `transition-all` | Use project CSS (no UX4G equivalent) | |
| `transition-colors` | Use project CSS (no UX4G equivalent) | |
| `duration-200` | Use project CSS (no UX4G equivalent) | |
| `duration-300` | Use project CSS (no UX4G equivalent) | |
| `cursor-pointer` | `ux4g-cursor-pointer` | |
| `select-none` | `ux4g-select-none` | |
| `sr-only` | `ux4g-sr-only` | |
| `aspect-video` | `ux4g-aspect-video` | |
| `object-cover` | `ux4g-of-cover` | |
| `ring` / `ring-2` | `ux4g-ring` / `ux4g-ring-2` (also `-0/1/4/8`, `-inset`) | v3.1.0+ |
| `ring-primary` / `ring-red-500` | `ux4g-ring-primary`, `ux4g-ring-success/error/warning/info/neutral` | v3.1.0+ |
| `outline-2` / `outline-none` | `ux4g-outline-2` / `ux4g-outline-none` (also `-1/4`, `-offset-*`) | v3.1.0+ |
| `divide-x` / `divide-y` | `ux4g-divide-x` / `ux4g-divide-y` (also `-0..4`, `-solid/dashed/dotted`) | v3.1.0+ |
| `scroll-smooth` | `ux4g-scroll-smooth` / `ux4g-scroll-auto` | v3.1.0+ |
| `snap-x` / `snap-start` | `ux4g-snap-x/y/both`, `ux4g-snap-start/end/center` | v3.1.0+ |

### Tailwind Colors → UX4G Semantic Colors

This is the most important migration. UX4G uses **semantic** color names that automatically handle dark mode:

| Tailwind | UX4G | Semantic Meaning |
|---|---|---|
| `text-white` | `ux4g-text-white` | White text |
| `text-black` | `ux4g-text-black` | Black text |
| `text-gray-900` | `ux4g-text-neutral-primary` | Primary body text |
| `text-gray-600` | `ux4g-text-neutral-secondary` | Secondary text |
| `text-gray-400` | `ux4g-text-neutral-tertiary` | Muted/subtle text |
| `text-emerald-600` | `ux4g-text-success` | Success indicator |
| `text-red-600` | `ux4g-text-error` | Error indicator |
| `text-amber-600` | `ux4g-text-warning` | Warning indicator |
| `bg-emerald-50` | `ux4g-bg-success-subtle` | Light success surface |
| `bg-emerald-100` | `ux4g-bg-success-soft` | Soft success surface |
| `bg-red-50` | `ux4g-bg-error-subtle` | Light error surface |
| `bg-red-100` | `ux4g-bg-error-soft` | Soft error surface |
| `border-green-800` | `ux4g-border-success-strong` | Strong success border |
| `border-red-800` | `ux4g-border-error-strong` | Strong error border |
| `border-emerald-300` | `ux4g-border-success` | Success border |
| `border-red-300` | `ux4g-border-error` | Error border |

### Tailwind Hover/Focus → UX4G States

```html
<!-- Tailwind -->
<button class="hover:bg-blue-600 focus:ring-2 focus:ring-blue-500 transition-colors">

<!-- UX4G — hover/focus must be in project CSS; UX4G components have built-in hover states -->
<button class="ux4g-btn ux4g-btn-primary ux4g-btn-md">
```

### Tailwind Dark Mode → UX4G (Automatic!)

**Key insight:** UX4G semantic colors automatically switch in dark mode. You do NOT need `dark:` prefixes.

```html
<!-- Tailwind (requires BOTH light + dark classes) -->
<div class="bg-emerald-50 dark:bg-emerald-900/30 border-green-300 dark:border-green-800">
  <span class="text-emerald-700 dark:text-emerald-400">Success</span>
</div>

<!-- UX4G (ONE class handles both themes) -->
<div class="ux4g-bg-success-subtle ux4g-border-success">
  <span class="ux4g-text-success">Success</span>
</div>
```

### Tailwind Responsive → UX4G Responsive

| Tailwind | UX4G | Breakpoint |
|---|---|---|
| `sm:flex` | `ux4g-sm-d-flex` | ≥576px |
| `sm:hidden` | `ux4g-sm-d-none` | ≥576px |
| `md:grid-cols-2` | `ux4g-md-grid-cols-2` | ≥768px |
| `md:flex-row` | `ux4g-md-flex-row` | ≥768px |
| `lg:grid-cols-3` | `ux4g-lg-grid-cols-3` | ≥992px |
| `lg:hidden` | `ux4g-lg-d-none` | ≥992px |

**Important:** UX4G v2.0.1 uses min-width breakpoints (mobile-first). A class applied at MD stays active on LG, XL, and 2XL too. This is the same model as Tailwind and Bootstrap 5.

---

## Migrating from Material UI

Material UI uses the `sx` prop and theme object. When migrating to UX4G:

### sx Prop → UX4G Classes

```jsx
// Material UI
<Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 3 }}>

// UX4G
<div className="ux4g-d-flex ux4g-ai-center ux4g-gap-6xs ux4g-p-m">
```

### MUI Spacing (×8px) → UX4G Tokens

| MUI `sx` | Pixels | UX4G |
|---|---|---|
| `p: 1` | 8px | `ux4g-p-xs` |
| `p: 2` | 16px | `ux4g-p-s` |
| `p: 3` | 24px | `ux4g-p-m` |
| `p: 4` | 32px | `ux4g-p-l` |
| `p: 5` | 40px | `ux4g-p-xl` |
| `gap: 1` | 8px | `ux4g-gap-4xs` |
| `gap: 2` | 16px | `ux4g-gap-6xs` |
| `gap: 3` | 24px | `ux4g-gap-xs` |

### MUI Components → UX4G Components

```jsx
// Material UI
<Button variant="contained" color="primary" size="large">Submit</Button>

// UX4G
<button className="ux4g-btn ux4g-btn-primary ux4g-btn-lg">Submit</button>
```

### MUI Elevation → UX4G Shadow

| MUI | UX4G |
|---|---|
| `elevation={0}` | `ux4g-shadow-l0` |
| `elevation={1}` | `ux4g-shadow-l1` |
| `elevation={2-3}` | `ux4g-shadow-l2` |
| `elevation={4-8}` | `ux4g-shadow-l3` |
| `elevation={9-16}` | `ux4g-shadow-l4` |
| `elevation={17-24}` | `ux4g-shadow-l4` |

### MUI Theme → UX4G Tokens

```js
// Material UI theme
const theme = createTheme({
  palette: { primary: { main: '#4a2bc2' } },
  spacing: 8,
  typography: { fontFamily: 'Noto Sans' }
});

// UX4G — already configured via CSS tokens
// Just import the CSS and tokens are automatically available:
// var(--ux4g-color-brand-primary) = #4a2bc2
// var(--ux4g-spacing-4) = 1rem
// var(--ux4g-typography-fontFamily-sans) = 'Noto Sans'...
```

---

## Color System Migration

UX4G provides three types of color classes:

### 1. Text Colors

| Class | Purpose |
|-------|---------|
| `ux4g-text-white` | White text |
| `ux4g-text-black` | Black text |
| `ux4g-text-neutral-primary` | Main body text |
| `ux4g-text-neutral-secondary` | Secondary/muted text |
| `ux4g-text-neutral-tertiary` | Subtle/disabled text |
| `ux4g-text-neutral-inverse` | Text on dark surfaces |
| `ux4g-text-primary` | Brand primary color |
| `ux4g-text-success` | Success/green |
| `ux4g-text-error` | Error/red |
| `ux4g-text-warning` | Warning/amber |
| `ux4g-text-info` | Info/cyan |

### 2. Background Colors

| Class | Purpose |
|-------|---------|
| `ux4g-bg-neutral-elevated` | Card/panel surface (white in light) |
| `ux4g-bg-neutral-soft` | Light gray background |
| `ux4g-bg-neutral-subtle` | Very subtle background |
| `ux4g-bg-primary` | Brand primary background |
| `ux4g-bg-primary-soft` | Light primary tint |
| `ux4g-bg-success-subtle` | Light green surface |
| `ux4g-bg-success-soft` | Medium green surface |
| `ux4g-bg-success-strong` | Dark green surface |
| `ux4g-bg-error-subtle` | Light red surface |
| `ux4g-bg-error-soft` | Medium red surface |
| `ux4g-bg-error-strong` | Dark red surface |
| `ux4g-bg-warning-subtle` | Light amber surface |
| `ux4g-bg-info-subtle` | Light cyan surface |

### 3. Border Colors

| Class | Purpose |
|-------|---------|
| `ux4g-border-success` | Green border |
| `ux4g-border-success-strong` | Dark green border |
| `ux4g-border-error` | Red border |
| `ux4g-border-error-strong` | Dark red border |
| `ux4g-border-warning` | Amber border |
| `ux4g-border-info` | Cyan border |
| `ux4g-border-primary` | Brand border |
| `ux4g-border-neutral-subtle` | Light border |
| `ux4g-border-neutral-strong` | Strong border |

### Color Tokens (CSS Custom Properties)

For custom styling, use the raw tokens directly:

```css
.my-element {
  color: var(--ux4g-color-brand-primary);       /* #4a2bc2 */
  background: var(--ux4g-color-neutral-100);    /* #f5f5f5 */
  border-color: var(--ux4g-color-red-600);      /* #db372d */
}
```

Available palettes: `primary`, `secondary`, `tertiary`, `neutral`, `red`, `blue`, `green`, `orange`, `purple`, `pink`, `cyan`, `skyblue`, `yellow`, `gold`, `lime` — each with shades 50-950.

---

## Dark Mode Migration

### How UX4G Dark Mode Works

UX4G uses `[data-theme="dark"]` on the root element. All semantic tokens automatically switch values:

```
Light: --ux4g-text-neutral-primary = #171717 (dark text)
Dark:  --ux4g-text-neutral-primary = #fafafa (light text)

Light: --ux4g-bg-success-subtle = #f2fcef (light green)
Dark:  --ux4g-bg-success-subtle = #002110 (dark green)
```

### Migration Rule

**Remove ALL `dark:` prefixed classes.** Replace the light+dark pair with ONE UX4G semantic class.

```html
<!-- BEFORE: Tailwind (2 classes per element) -->
<span class="text-emerald-700 dark:text-emerald-400">Success</span>
<div class="bg-red-50 dark:bg-red-900/30 border-red-300 dark:border-red-800">Error</div>

<!-- AFTER: UX4G (1 class per element — handles both themes) -->
<span class="ux4g-text-success">Success</span>
<div class="ux4g-bg-error-subtle ux4g-border-error">Error</div>
```

### Glass/Overlay Effects

For semi-transparent overlays on dark surfaces, use RGB tokens:

```css
/* Using UX4G tokens */
background: rgba(var(--ux4g-rgb-white), 0.1);  /* 10% white overlay */
border-color: rgba(var(--ux4g-rgb-white), 0.15); /* 15% white border */
```

---

## Responsive Design Migration

### UX4G Breakpoints

| Name | Min-Width | Tailwind equiv | Bootstrap equiv |
|------|-----------|----------------|-----------------|
| **SM** | ≥576px | `sm:` | `-sm-` |
| **MD** | ≥768px | `md:` | `-md-` |
| **LG** | ≥992px | `lg:` | `-lg-` |
| **XL** | ≥1200px | `xl:` | `-xl-` |
| **2XL** | ≥1400px | `2xl:` | `-xxl-` |

### Responsive Class Pattern

```
ux4g-{breakpoint}-{utility}
```

Examples:
- `ux4g-sm-d-flex` — flex at SM breakpoint
- `ux4g-md-flex-row` — row direction at MD
- `ux4g-lg-jc-between` — space-between at LG
- `ux4g-md-grid-cols-2` — 2 columns at MD
- `ux4g-lg-grid-cols-3` — 3 columns at LG

### Available Responsive Utilities

At each breakpoint (sm/md/lg/xl/2xl):
- Display: `d-none`, `d-block`, `d-flex`, `d-inline-flex`, `d-inline-block` (note: responsive `display: grid` is not a separate class — use `ux4g-grid` with responsive `grid-cols`)
- Flex direction: `flex-row`, `flex-col`, `flex-row-reverse`, `flex-col-reverse`
- Flex wrap: `flex-wrap`, `flex-nowrap`
- Flex grow/shrink: `flex-grow-1`, `flex-grow-0`, `flex-shrink-0`, `flex-1`
- Justify content: `jc-start`, `jc-center`, `jc-between`, `jc-end`
- Align items: `ai-start`, `ai-center`, `ai-end`
- Grid columns: `{bp}-grid-cols-1` through `{bp}-grid-cols-12` (e.g., `ux4g-md-grid-cols-2`)
- Grid span: `{bp}-cols-span-1` through `{bp}-cols-span-12`
- Position/inset: responsive `static/relative/absolute/fixed/sticky` + inset utilities
- Padding: `p-xs` through `p-2xl`
- Gap: `gap-4xs` through `gap-2xl`

---

## Component Migration

### Available UX4G Components

| Component | Class Prefix | Key variants |
|-----------|-------------|--------------|
| Button | `ux4g-btn` | `primary`, `secondary`, `outline-primary`, `sm/md/lg` |
| Card | `ux4g-card` | `card-body`, `card-title`, `card-footer` |
| Alert | `ux4g-alert` | `alert-info`, `alert-success`, `alert-error`, `alert-warning` |
| Badge | `ux4g-badge` | `badge-primary`, `badge-sm` |
| Modal | `ux4g-modal` | `modal-dialog`, `modal-content`, `modal-header` |
| Accordion | `ux4g-accordion` | `accordion-item`, `accordion-trigger` |
| Tabs | `ux4g-tab` | `tab-list`, `tab-panel` |
| Table | `ux4g-table` | `table-bordered`, `table-striped` |
| Input | `ux4g-input` | `input-sm/md/lg` |
| Spinner | `ux4g-spinner` | `spinner-sm/md/lg` |
| Tooltip | `ux4g-tooltip` | — |
| Dropdown | `ux4g-dropdown` | `dropdown-menu`, `dropdown-item` |
| Select | `ux4g-select` / `ux4g-form-select` | custom single/multi + native; `select-sm/md/lg` |
| Combobox | `ux4g-combobox` | `combobox-single/multi`, `combobox-sm/md/lg` |
| Breadcrumb | `ux4g-breadcrumb` | `breadcrumb-item` |
| Pagination | `ux4g-pagination` | `page-item`, `page-link` |
| Stepper | `ux4g-stepper` | `stepper-item`, `stepper-active` |

---

## Accessibility Compliance

UX4G components are built with WCAG 2.1 AA compliance:

- **Focus indicators:** UX4G components have built-in focus styles; use `ux4g-ring` for custom elements
- **Screen reader text:** Use `ux4g-sr-only` for hidden labels
- **Color contrast:** All semantic tokens meet 4.5:1 ratio
- **Reduced motion:** Components respect `prefers-reduced-motion`
- **Keyboard navigation:** All components are keyboard accessible
- **ARIA attributes:** Built into component markup

---

## Common Challenges & Solutions

### Challenge 1: Arbitrary Values

UX4G doesn't support arbitrary values like `w-[358px]` or `max-h-[calc(100vh-11rem)]`.

**Solution:** Use inline styles for truly one-off values:
```html
<div style="width: 358px">
<div style="max-height: calc(100vh - 11rem)">
```

### Challenge 2: Complex Responsive Grids

Layouts like `lg:grid-cols-[1fr_14rem]` don't have UX4G equivalents.

**Solution:** Use CSS custom properties or a local utility class:
```css
.sidebar-layout {
  display: grid;
  grid-template-columns: 1fr 14rem;
}
```

### Challenge 3: Decorative Colors (Code Blocks, Syntax Highlighting)

Code block syntax highlighting uses specific hex colors that aren't semantic.

**Solution:** Keep these as-is in a local CSS file. They're decorative, not part of the theme system.

### Challenge 4: Tailwind's Half-Step Spacing (0.5, 1.5, 2.5)

UX4G doesn't have half-step values like `p-1.5` (6px) or `gap-2.5` (10px).

**Solution:** Use the closest UX4G token or inline style:
- `p-1.5` (6px) → `ux4g-p-3xs` (closest: 4px) or inline `padding: 6px`
- `gap-2.5` (10px) → `ux4g-gap-5xs` (12px, close enough in most cases)

### Challenge 5: State Variants (hover, focus, active)

UX4G does NOT provide Tailwind-style conditional state utilities (`hover:*`, `focus:*`). UX4G components (buttons, links, cards) already have hover/focus states built in. For custom elements, use project-level CSS:

```css
.my-card:hover {
  background: var(--ux4g-bg-neutral-soft);
  transform: translateY(-2px);
  box-shadow: var(--ux4g-shadow-l3);
}

.my-element:focus-visible {
  outline: 2px solid var(--ux4g-color-primary-600);
  outline-offset: 2px;
}
```

For ring effects, UX4G provides `ux4g-ring`, `ux4g-ring-inset`, and `ux4g-ring-0` through `ux4g-ring-8` (always applied, not conditional on focus).

For states NOT covered by component defaults, keep in local CSS:
```css
.my-card:hover { transform: scale(1.05); }
```

---

## Common Pitfalls & Solutions

### Pitfall 1: Content appears "shifted" or "narrow"

**Cause:** `ux4g-container` applies responsive max-width (max 1320px on large screens). If your header is full-width but content uses `ux4g-container`, content appears narrower.

**Solution:** Use `ux4g-container-fluid` for full-width sections, or ensure both header AND content use `ux4g-container` consistently.

```html
<!-- Full-width hero with contained content -->
<section style="width: 100%;">
  <div class="ux4g-container ux4g-px-s">
    <!-- Content centered at max 1320px -->
  </div>
</section>
```

### Pitfall 2: #root element collapses

**Cause:** The UX4G reset removes all margins/paddings. If your React/Vue root element relies on implicit sizing, it may not fill the viewport.

**Solution:** Add explicit width to `#root`:

```css
#root {
  width: 100%;
  min-height: 100vh;
}
```

### Pitfall 3: Flex items stretch unexpectedly

**Cause:** The default `align-items` for flex containers is `stretch`. UX4G's `ux4g-d-flex` only sets `display: flex` — it does NOT set `align-items`.

**Solution:** Always pair `ux4g-d-flex` with alignment classes:

```html
<div class="ux4g-d-flex ux4g-ai-center ux4g-jc-between">
```

### Pitfall 4: Images break layout

**Cause:** UX4G sets `img { display: block; max-width: 100%; height: auto; }`. Inline images will no longer sit on the text baseline.

**Solution:** This is intentional. If you need inline images, use `style="display: inline;"` on specific images.

### Pitfall 5: Lists lose bullets/numbering

**Cause:** UX4G resets `ul { list-style: none; }`.

**Solution:** For content lists that need bullets:

```css
.content-list { list-style: disc; padding-left: 1.5em; }
.content-list-ordered { list-style: decimal; padding-left: 1.5em; }
```

### Pitfall 6: Special characters (₹, →, —) corrupted

**Cause:** Some build tools (particularly PowerShell on Windows) may corrupt UTF-8 encoding when writing files programmatically.

**Solution:**
- Always save files as UTF-8 without BOM
- Don't use PowerShell's `[System.IO.File]::WriteAllText()` for `.tsx` files
- Use your IDE or `git checkout -- <file>` to restore corrupted files

### Pitfall 7: ux4g-d-grid doesn't work

**Cause:** Class was renamed in v2.0.0.

**Solution:** Use `ux4g-grid` (without the `-d-` infix).

---

## Global CSS Reset Behavior

UX4G v2.0.0+ includes a global reset at the top of its stylesheet:

```css
:where(html) { box-sizing: border-box; }
:where(*, :before, :after) { border: 0; box-sizing: border-box; margin: 0; outline: 0; padding: 0; }
:where(img) { display: block; height: auto; max-width: 100%; }
:where(body) { background-color: var(--ux4g-bg-neutral-elevated); color: var(--ux4g-text-neutral-primary); font-family: var(--ux4g-font-family-base); }
:where(button) { background: none; cursor: pointer; }
:where(a) { text-decoration: none; }
:where(ul) { list-style: none; }
```

**Impact:**
- ALL elements lose their default margin, padding, and border
- Images become `display: block` (no inline spacing gaps)
- Lists lose bullets and indentation
- Links lose underlines
- Buttons lose default browser styling

**What you need to do:**
- Use UX4G spacing classes (`ux4g-mt-s`, `ux4g-mb-m`, `ux4g-p-l`) for all spacing
- Don't rely on default browser margins (e.g., `<p>` or `<h1>` won't have margins)
- Add `list-style` back manually if you need bullet lists outside of UX4G components

---

## Import Order (Critical)

The order of CSS imports matters. UX4G styles must load **before** your project overrides.

```typescript
// main.tsx / main.ts / main.js

// 1. UX4G Design System CSS (FIRST — establishes base reset + utility classes)
import 'ux4g-web-components/styles.css';

// 2. UX4G Design System JS (components, accessibility widget hooks, alerts)
import 'ux4g-web-components/design-system';

// 3. Your project styles (AFTER UX4G — so your overrides win by cascade)
import './styles/index.css';
```

**Why this matters:**
- UX4G includes a global CSS reset (`:where(*) { margin: 0; padding: 0; }`)
- If your styles load before UX4G, the reset will override your margins/paddings
- If your styles load after UX4G, your overrides work as expected

---

## Framework-Specific Notes

### React (Vite)

```typescript
// main.tsx
import 'ux4g-web-components/styles.css';
import 'ux4g-web-components/design-system';
import './styles/index.css';
```

Your root App component should use inline styles for the page wrapper:

```tsx
function App() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header />
      <main style={{ flex: 1 }}>
        <Routes>{/* ... */}</Routes>
      </main>
      <Footer />
    </div>
  );
}
```

### Vue (Vite)

```typescript
// main.ts
import 'ux4g-web-components/styles.css';
import 'ux4g-web-components/design-system';
import './assets/styles/index.css';
```

### Angular

```json
// angular.json → styles array
"styles": [
  "node_modules/ux4g-web-components/styles/ux4g.css",
  "src/styles.css"
]
```

```typescript
// main.ts
import 'ux4g-web-components/design-system';
```

### Next.js (SSR)

```typescript
// app/layout.tsx or _app.tsx
import 'ux4g-web-components/styles.css';
import 'ux4g-web-components/design-system';
import '../styles/globals.css';
```

---

## Brand Theming

UX4G v2.0.1 uses CSS custom properties for theming with a clean token cascade. Override them in `:root`:

```css
:root {
  /* Primary brand color (replaces UX4G default purple) */
  --ux4g-color-primary-600: #c11e20 !important;  /* Your brand primary */
  --ux4g-color-primary-700: #a81a1c !important;  /* Hover state */
  --ux4g-color-primary-800: #8B1517 !important;  /* Active state */
  --ux4g-color-primary-50: #FEF2F2 !important;   /* Light background */

  /* Secondary brand color */
  --ux4g-color-secondary-500: #A4916C !important;
  --ux4g-color-secondary-600: #8B7A5A !important;
}
```

In v2.0.1+, buttons automatically pick up brand colors via the token cascade:
- `.ux4g-btn-primary` background → `--ux4g-bg-primary-strong` → `--ux4g-color-primary-600`
- `.ux4g-btn-primary:hover` → `--ux4g-bg-primary-strong-hover` → `--ux4g-color-primary-700`
- `.ux4g-btn-primary:active` → `--ux4g-bg-primary-stronger` → `--ux4g-color-primary-800`

**No button CSS overrides needed.** No `!important` on component selectors.

### v2.0.1 Button Architecture

Button default dimensions (`min-height`, `padding`) use a `:where()` wrapper at zero specificity. This means:
- Explicit size classes (`.ux4g-btn-sm`, `.ux4g-btn-xs`) always win regardless of CSS source order
- No cascade conflicts between variant and size classes after minification
- The old `cascade-fixes.css` workaround is no longer needed

---

## Accessibility Widget Integration

Add the UX4G accessibility widget in your `index.html`:

```html
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
  <!-- UX4G Accessibility Widget (load async, non-blocking) -->
  <script src="https://cdn.ux4g.gov.in/tools/accessibility-widget.js" async></script>
</body>
```

---

## Verification Checklist

After migration, verify:

- [ ] **Visual parity** — Site looks the same in light mode
- [ ] **Dark mode** — Toggle theme; all elements switch correctly
- [ ] **Responsive** — Test at 320px, 768px, 1024px, 1440px
- [ ] **Keyboard navigation** — Tab through all interactive elements
- [ ] **Screen reader** — Test with NVDA/VoiceOver
- [ ] **Build passes** — No CSS errors, no TypeScript errors
- [ ] **Performance** — CSS bundle size equal or smaller
- [ ] **No old framework references** — grep for old class names
- [ ] **Accessibility audit** — Run axe DevTools on key pages

### Audit Script

Run this to check your migration percentage:

```bash
# Count ux4g-* classes vs other utilities
grep -roh 'ux4g-[a-zA-Z0-9-]*' src/ | wc -l  # UX4G classes
grep -roh 'className="[^"]*"' src/ | wc -l    # Total classNames
```

---

## Migration Do's and Don'ts (Quick Reference)

### DO

1. **Remove old framework first** — Tailwind/Bootstrap classes conflict with UX4G
2. **Install latest version** — v2.0.1+ has clean token cascade for button theming
3. **Maintain import order** — UX4G CSS → design-system JS → your project CSS
4. **Override at token level** — `--ux4g-color-primary-600/700/800` in `:root` handles all buttons
5. **Add `#root { width: 100%; min-height: 100vh }`** — UX4G reset strips margins
6. **Use `ux4g-grid`** — NOT `ux4g-d-grid` (renamed in v2.0.0)
7. **Always pair flex with alignment** — `ux4g-d-flex ux4g-ai-center ux4g-jc-between`
8. **Migrate page by page** — verify against live site before moving to next
9. **Check package before writing custom CSS** — search `ux4g.css` for existing classes
10. **Use inline styles on app root wrapper** — avoids cascade conflicts with lazy CSS
11. **Test all breakpoints** — SM≥576, MD≥768, LG≥992, XL≥1200

### DON'T

1. **Don't use `!important` on buttons** — v2.0.1 token cascade handles it
2. **Don't keep Tailwind alongside UX4G** — class conflicts cause chaos
3. **Don't use `ux4g-d-grid`** — renamed to `ux4g-grid`
4. **Don't assume range-based breakpoints** — MD means ≥768px AND all larger
5. **Don't rely on browser default margins** — UX4G resets ALL to zero
6. **Don't prefix custom classes with `ux4g-`** — may conflict with future versions
7. **Don't use PowerShell file writes on .tsx** — corrupts ₹ and special chars
8. **Don't override components when tokens exist** — wrong: `.ux4g-btn-primary { background: red }`, right: `:root { --ux4g-color-primary-600: red }`
9. **Don't nest containers** — `ux4g-container` inside `ux4g-container` double-constrains
10. **Don't disable design-system JS** — not responsible for layout issues
11. **Don't mix inline styles and utility classes on same property** — inline always wins
12. **Don't migrate and redesign simultaneously** — first match the UI, then improve

---

## Migration Checklist (Copy & Use)

Use this checklist when migrating any project:

- [ ] Remove Tailwind CSS / Bootstrap dependencies
- [ ] Install `ux4g-web-components@latest` (v2.0.1+)
- [ ] Set correct CSS import order (UX4G first, then project CSS)
- [ ] Import `ux4g-web-components/design-system` JS
- [ ] Add `#root { width: 100%; min-height: 100vh; }` to your CSS
- [ ] Set `data-theme="light"` on `<html>` element
- [ ] Replace `ux4g-d-grid` → `ux4g-grid` globally
- [ ] Update all responsive classes to min-width model
- [ ] Replace numeric spacing with semantic tokens (gap-4 → gap-s)
- [ ] Add explicit alignment to all flex containers
- [ ] Update container usage (container vs container-fluid)
- [ ] Add brand color token overrides in `:root` (no button overrides needed)
- [ ] Add accessibility widget script
- [ ] Use inline styles on app root wrapper (not utility classes)
- [ ] Don't define custom classes with `ux4g-` prefix
- [ ] Test on all breakpoints: mobile (<576), tablet (768+), desktop (1200+)
- [ ] Verify UTF-8 encoding of all files (check ₹, →, — symbols)
- [ ] Run production build and verify no CSS order issues
- [ ] Run accessibility audit (axe DevTools)

---

## Support & Resources

| Resource | URL |
|----------|-----|
| **Developer Documentation** | https://doc.ux4g.gov.in/ |
| **Component Library** | https://ux4g.gov.in/components |
| **Figma Design File** | https://www.figma.com/community/file/1654976809099378421 |
| **npm Package** | https://www.npmjs.com/package/ux4g-web-components |
| **CDN** | https://cdn.ux4g.gov.in/ |
| **Support Email** | support.ux4g@digitalindia.gov.in |
| **Audit 360** | https://audit360.ux4g.gov.in/ |

### Getting Help

1. Check the developer docs first: https://doc.ux4g.gov.in/
2. Search the component library for examples
3. Email the UX4G team for migration support
4. Request a migration workshop for your department

---

*Document version: 2.0 | September 2026 | UX4G Design System + ux4g-web-components v2.1.0*
