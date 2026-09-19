---
name: Terminal Precision
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#464555'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#777587'
  outline-variant: '#c7c4d8'
  surface-tint: '#4d44e3'
  primary: '#3525cd'
  on-primary: '#ffffff'
  primary-container: '#4f46e5'
  on-primary-container: '#dad7ff'
  inverse-primary: '#c3c0ff'
  secondary: '#565e74'
  on-secondary: '#ffffff'
  secondary-container: '#dae2fd'
  on-secondary-container: '#5c647a'
  tertiary: '#005338'
  on-tertiary: '#ffffff'
  tertiary-container: '#006e4b'
  on-tertiary-container: '#67f4b7'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e2dfff'
  primary-fixed-dim: '#c3c0ff'
  on-primary-fixed: '#0f0069'
  on-primary-fixed-variant: '#3323cc'
  secondary-fixed: '#dae2fd'
  secondary-fixed-dim: '#bec6e0'
  on-secondary-fixed: '#131b2e'
  on-secondary-fixed-variant: '#3f465c'
  tertiary-fixed: '#6ffbbe'
  tertiary-fixed-dim: '#4edea3'
  on-tertiary-fixed: '#002113'
  on-tertiary-fixed-variant: '#005236'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 30px
    fontWeight: '700'
    lineHeight: 38px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '600'
    lineHeight: 22px
    letterSpacing: -0.005em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-eyebrow:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.08em
  metric-display:
    fontFamily: JetBrains Mono
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 34px
    letterSpacing: -0.03em
  metric-lg:
    fontFamily: JetBrains Mono
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.02em
  metric-md:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: -0.01em
  metric-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 16px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1.25rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-tablet: 1.5rem
  margin-desktop: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1.25rem
  space-xl: 2rem
---

## Brand & Style

This design system establishes an analytical, high-integrity personal cryptocurrency trade journal. It is engineered for active discretionary traders, systematic quantitative participants, and risk-sensitive portfolio managers who value rigorous retrospection over speculative hype. 

The aesthetic adheres to **Analytical Modernism**: an intersection of clinical fintech clarity, Swiss grid discipline, and specialized developer-grade data ergonomics. It avoids neon gamification, decorative skeuomorphism, and low-contrast abstractions in favor of direct, unadorned quantitative truth. The visual tone must evoke absolute accountability, surgical discipline, emotional detachment from market volatility, and unwavering structural control.

Key brand hallmarks:
- **Clinical Rigor:** Every metric, PnL figure, and execution tick is treated as primary evidence; data density is elevated while maintaining ample white space and structural breathing room.
- **Architectural Clarity:** Layouts favor structural grid lines, ultra-fine hairline dividers, and deliberate card hierarchies rather than high-elevation floating panels.
- **Emotional Neutrality:** Accent and status hues are deployed surgically. Win and loss indicators are informative data points rather than celebratory or punishing rewards.

## Colors

The color system delivers high functional legibility under daylight ambient conditions, adhering strictly to a light-canvas foundation. 

### Canvas & Surfaces
- **Canvas Base:** `#F8FAFC` provides the primary app viewport canvas, grounding peripheral panels. `#F1F5F9` is reserved for structural sub-canvases, header strips, and interactive hover planes.
- **Surface Pure:** `#FFFFFF` defines card containers, modal dialogues, input shells, and tabular rows.
- **Borders & Dividers:** Primary containment lines use `#E2E8F0` (slate-200), tapering to `#F1F5F9` for internal row separations.

### Primary Accents & Emphasis
- **Primary Accent:** `#4F46E5` (Indigo-600) drives the primary visual anchor, active navigational markers, interactive focus halos, and core brand identifiers. `#4338CA` acts as its active pressed counterpart.
- **Primary Subdued:** `#EEF2FF` and `#E0E7FF` provide low-intensity wash fills for active trade filters, selected chips, and primary category tags.
- **High-Density Focus:** Deep charcoal slate (`#0F172A` and `#090D16`) serves as the "Special Emphasis" tier—reserved for flagship validation badges, milestone benchmark callouts, and dark-card summaries.

### Quantitative Signals & Feedback
Color coding for financial performance must remain distinct, unambiguous, and accessible:
- **Long / Profit / Win:** `#10B981` (primary marker), `#059669` (accessible text variant), with `#ECFDF5` as the soft backdrop badge wash.
- **Short / Loss / Danger:** `#EF4444` (primary marker), `#DC2626` (high-contrast text variant), with `#FEF2F2` for warning surfaces and invalid execution alerts.
- **Caveat / Provisional / Pending:** `#F59E0B` (primary warning), `#D97706` (dark text variant), `#FEF3C7` (surface tint), and `#FDE68A` (containment border).

### Typography Tones
- **Primary Text:** `#0F172A` delivers peak contrast for headers, standard readouts, and execution metrics.
- **Secondary Text:** `#64748B` anchors metadata, contextual microcopy, table column headers, and structural labels.
- **Tertiary & Muted:** `#94A3B8` designates disabled states, placeholder strings, and tick marks.

## Typography

The typographical foundation relies on a strict dual-font execution:
1. **Structural Prose & Layout UI (`Inter`):** Governs navigation links, contextual instructions, table titles, modal alerts, and interactive labels.
2. **Deterministic Monospace Data (`JetBrains Mono`):** Applied systematically to all financial execution figures, currency amounts, percentages, R:R multiples, risk fractions, trade counts, entry/exit prices, timestamps, crypto tickers, and wallet hashes.

### Typographic Hierarchy Rules
- **Eyebrows:** All component and section headers must lead with a `label-eyebrow` formatted in full uppercase with expanded letter-spacing (`0.08em`), rendered in `#64748B`.
- **Tabular Figures:** When utilizing `JetBrains Mono` within tables or ledger lists, figures must employ tabular alignment (`font-variant-numeric: tabular-nums`) to ensure vertical column scanning alignment across signed digits and decimal stops.
- **Metric Contrast:** Large metrics (`metric-display`) should be paired immediately with an adjacent `label-eyebrow` or `body-sm` description to establish explicit context without visual ambiguity.

## Layout & Spacing

The architecture operates on an unyielding fixed-fluid hybrid structure designed for high-density trade tracking.

### App Shell Architecture
- **Navigation Rail:** A fixed desktop sidebar pinned at `260px` width spanning 100vh. It maintains a persistent top status badge indicating runtime execution mode (e.g., "Live Journaling" vs. "Backtesting / Paper").
- **Main Canvas:** A fluid operational canvas positioned adjacent to the sidebar, utilizing an 8pt-based vertical rhythm. The maximum content width expands to `1600px` to comfortably support wide multi-column trade ledgers.

### Breakpoints & Responsive Behavior
- **Desktop (>= 1200px):** 12-column layout. Sidebar remains docked at `260px`. Metric summary modules sit in 4-column groupings. Data tables utilize full horizontal breadth with unclipped columns.
- **Tablet (768px – 1199px):** Sidebar collapses to a condensed `64px` icon-only state or off-canvas drawer. Metric strips reflow to 2-column or 3-column rows. Tabular views activate horizontal scroll containers with sticky asset/pair columns.
- **Mobile (< 768px):** Single-column stack. Sidebar transitions to an absolute hamburger modal sheet. Spacing margins contract to `1rem` (`margin`). High-priority trade summary metrics convert into swipeable horizontal cards.

## Elevation & Depth

This design system deliberately eschews deep dropshadows, layered blur treatments, and multi-tier z-plane extrusions. Depth is conveyed strictly through **tonal separation and micro-borders**.

### Surface Elevation Strategy
- **Layer 0 (Canvas):** Tone `#F8FAFC`. Houses the global framework, background guttering, and viewport canvas.
- **Layer 1 (Card Surface):** Pure `#FFFFFF` resting on `#F8FAFC`. Layer distinction is established via a crisp 1px hairline border of `#E2E8F0` coupled with a micro ambient shadow: `box-shadow: 0 1px 3px 0 rgba(15, 23, 42, 0.05), 0 1px 2px -1px rgba(15, 23, 42, 0.05)`.
- **Layer 2 (Interactive Floating Elements):** Dropdown filters, date pickers, context menus, and tooltips utilize `#FFFFFF` surrounded by a dual border/shadow treatment: a 1px border in `#CBD5E1` and an elevated shadow: `box-shadow: 0 4px 6px -1px rgba(15, 23, 42, 0.07), 0 2px 4px -2px rgba(15, 23, 42, 0.05)`.
- **Layer 3 (Overlays & Modals):** Trade entry dialogs and log detail drawers sit atop a solid backdrop wash of `rgba(15, 23, 42, 0.35)` with zero back-blur, maintaining structural sharpness.

### Structural Hairlines
Panel separations, sub-section breaks, and table headers reject heavy divider fills. They rely exclusively on 1px solid hairline rules using `#E2E8F0` or `#F1F5F9`.

## Shapes

The design system enforces a precise, disciplined structural geometry:
- **Cards, Panels, and Inputs:** Bound to a calibrated `10px` to `12px` corner radius (`rounded-lg` mapping to `0.625rem`–`0.75rem`), balancing professional composure with contemporary finish.
- **Sub-elements & Buttons:** Interactive elements (buttons, inputs, dropdown items) standardise on `6px` to `8px` (`0.375rem` to `0.5rem`).
- **Data Status Tokens & Badges:** Badges, market status pills, and directional tags utilize complete circular curvature (`rounded-full`, 9999px) to visually distinguish immutable data classifications from square-form structural cards.
- **Dropzones:** CSV import regions and chart screenshot attach-areas use standard rectangular boundaries with a 2px dashed border rule (`#CBD5E1`).

## Components

### Buttons
- **Primary:** Background `#4F46E5`, text `#FFFFFF`, font-weight 600, radius `8px`. Hover: `#4338CA`. Active: scale 0.99. Focus: `0 0 0 3px rgba(79, 70, 229, 0.25)`.
- **Secondary / Outline:** Background `#FFFFFF`, border `1px solid #E2E8F0`, text `#0F172A`. Hover: `#F8FAFC`, border `#CBD5E1`.
- **Danger (Destructive):** Background `#FEF2F2`, border `1px solid #FCA5A5`, text `#DC2626`. Hover: `#FEE2E2`.
- **Size Options:** Standard execution uses compact `h-9` (`36px`) and micro `h-7` (`28px`) for tight tabular actions.

### Badges & Status Pills
- **Execution Metric Pill:** `rounded-full`, padding `px-2.5 py-0.5`, font-size `11px`, `JetBrains Mono` font-weight 500.
  - *Win / Long:* Background `#ECFDF5`, text `#059669`.
  - *Loss / Short:* Background `#FEF2F2`, text `#DC2626`.
  - *Break-even / Inactive:* Background `#F1F5F9`, text `#64748B`.
- **Circular Numbered Step Badges:** Symmetrical `20px x 20px` or `24px x 24px` circles with centered numeric text (`JetBrains Mono`, 11px), styled with `#0F172A` background and `#FFFFFF` glyphs to signify setup stages.

### Input Fields & Controls
- **Text & Numeric Inputs:** Solid `#FFFFFF` fill with `1px solid #E2E8F0`, height `38px`, padding `0 12px`, radius `8px`. Hover: border `#CBD5E1`. Focus: border `#4F46E5`, outline box-shadow `0 0 0 2px rgba(79, 70, 229, 0.15)`. Text in input fields defaults to `JetBrains Mono` for quantity, price, and SL/TP fields.
- **Checkboxes & Radios:** Native form-control replacements bounded to `16px x 16px`, radius `4px` (checkbox) or `rounded-full` (radio), border `1.5px solid #CBD5E1`. Checked state: background `#4F46E5` with `#FFFFFF` micro-check mark.

### Data Tables
- **Grid Treatment:** Clean white canvas (`#FFFFFF`) with strict hairline horizontal borders (`border-b border-slate-100`). No alternating zebra stripes.
- **Padding:** Compact vertical density (`py-2.5` to `py-3`), horizontal cell padding `px-4`.
- **Header Row:** Background `#F8FAFC`, border-bottom `1px solid #E2E8F0`. Header labels render in `Inter` `label-eyebrow` (`text-slate-500`, uppercase, tracking-wider).
- **Numeric Columns:** All numerical headers and cell data align right (`text-right`) and render via `JetBrains Mono`.

### Progress & Win-Rate Bars
- **Progress Track:** Symmetrical linear bar with height `h-2` (`8px`), `rounded-full` background `#F1F5F9`.
- **Progress Fill:** Fill bars feature solid thematic tokens (Emerald `#10B981` for win-rate, Indigo `#4F46E5` for portfolio allocation) with crisp edge definition without internal gradients.

### Highlight Callout Cards
- **Special Emphasis Card (Dark Slate):** Reserved for core validated setups. Background `#0F172A`, text `#FFFFFF`, border `1px solid #1E293B`, radius `12px`. Sub-labels render in `#94A3B8`. Numeric values render in glowing high-contrast `#38BDF8` or `#34D399` (`JetBrains Mono`).

### Dropzones
- **CSV & Attachment Uploaders:** Boundary rendered with `2px dashed #CBD5E1`, background `#F8FAFC`, radius `12px`, padding `24px`. Hover state activates `#EEF2FF` wash with dashed border transitioning to `#818CF8`.