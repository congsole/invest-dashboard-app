# Design System Specification: The Precision Ledger

## 1. Overview & Creative North Star
**Creative North Star: The Architectural Editorial**
In the world of high-stakes asset management, trust isn't built with generic templates; it's built with precision and clarity. This design system moves away from "utility" aesthetics toward a high-end, editorial experience. We treat financial data like a curated gallery—prioritizing white space, sophisticated typography, and structural depth.

The goal is to break the rigid, boxy nature of mobile dashboards through **intentional asymmetry** and **tonal layering**. We want the user to feel they are interacting with a bespoke financial journal, not just another fintech app. We achieve this by favoring color-block sectioning over lines and using varying font weights to create a narrative flow.

---

## 2. Colors
Our palette is rooted in a "Trustworthy Blue" foundation, expanded through Material Design 3 logic to provide tonal depth that flat hex codes cannot achieve.

### Surface Hierarchy & The "No-Line" Rule
**Explicit Instruction:** Do not use 1px solid borders to section off content. Boundaries are defined solely through background shifts.
- **Base Layer:** Use `surface` (#f8f9ff) as the primary canvas.
- **Sectioning:** Use `surface_container_low` (#eff4ff) or `surface_container` (#e5eeff) to define large content areas.
- **Nesting:** To highlight a specific card within a section, use `surface_container_lowest` (#ffffff). This "white-on-tint" approach creates a sophisticated lift that feels premium and clean.

### The Glass & Gradient Rule
To prevent the UI from feeling static, use **Glassmorphism** for persistent elements like bottom navigation bars or floating headers. Use a semi-transparent `surface_container_low` with a `backdrop-blur` of 20px.

For high-impact elements (like Total Portfolio Balance), apply a subtle linear gradient from `primary` (#003ec7) to `primary_container` (#0052ff) at a 135-degree angle. This adds "visual soul" and a sense of movement to static numbers.

---

## 3. Typography
This design system utilizes a dual-font strategy to balance character with legibility.

- **The Voice (Manrope):** Used for `display` and `headline` scales. Its geometric yet friendly curves provide a high-end, modern editorial feel.
    - *Usage:* Large portfolio balances, screen titles, and high-level summaries.
- **The Engine (Inter):** Used for `title`, `body`, and `label` scales. Inter is the industry standard for numerical legibility.
    - *Usage:* Data points, stock tickers, transaction history, and fine print.

**Hierarchy Note:** Always pair a `headline-lg` (Manrope) with a `label-md` (Inter) in all-caps with +5% letter spacing to create a professional, "Financial Times" style contrast.

---

## 4. Elevation & Depth
We eschew traditional shadows in favor of **Tonal Layering**.

- **The Layering Principle:** Depth is achieved by stacking. A `surface_container_highest` card sitting on a `surface` background provides all the "elevation" needed for a professional look.
- **Ambient Shadows:** When a "floating" effect is required for a Modal or FAB, use a shadow with a blur radius of 24px and an opacity of 6%. The shadow color must be tinted with the `on_surface` (#0b1c30) token rather than pure black to keep the light "natural."
- **The Ghost Border:** If a border is required for accessibility (e.g., in high-contrast mode), use the `outline_variant` token at **15% opacity**. Never use 100% opaque lines.

---

## 5. Components

### Cards & Data Visualization
- **Cards:** Use `rounded-xl` (1.5rem) for main dashboard containers. Do not use dividers. Separate internal sections using `body-sm` labels and 24px of vertical white space.
- **Charts:** Use a 2px stroke for line charts. Fill the area under the line with a gradient of `tertiary` (for profit) or `error` (for loss) transitioning to 0% opacity. This creates a "glow" effect that highlights the data without cluttering the screen.

### Buttons
- **Primary:** Rounded-full (9999px) using `primary` background and `on_primary` text. Use for the main "Invest" or "Trade" actions.
- **Secondary:** Tonal buttons using `secondary_container` background. These should feel integrated into the surface, not fighting for attention.
- **Tertiary:** Text-only buttons using `primary` color for labels. Use for "See All" or "View Details" links.

### Input Fields & Search
- **Styling:** Use `surface_container_high` for the input track. No border.
- **Focus State:** On focus, the background shifts to `surface_container_lowest` with a 1px `primary` ghost border (20% opacity).

### Action Chips
- **Selection:** Use `primary_fixed` with `on_primary_fixed` text for active states (e.g., selecting timeframes like 1D, 1W, 1M).
- **Unselected:** Use `surface_container_highest` with `on_surface_variant` text.

---

## 6. Do's and Don'ts

### Do
- **DO** use the `primary_fixed` and `secondary_fixed` tokens for elements that need to remain consistent across light and dark modes.
- **DO** use significant padding (minimum 20px) inside cards to allow the editorial typography to "breathe."
- **DO** use `tertiary` (#005b21) for positive growth; it is more sophisticated and "trustworthy" than a bright neon green.

### Don't
- **DON'T** use lines to separate list items. Use a 12px vertical gap or a subtle `surface_container_low` background on every other item.
- **DON'T** use pure black (#000000). Always use `on_surface` or `on_background` for text to maintain the soft-premium feel.
- **DON'T** use `rounded-none` or `rounded-sm`. Financial tech should feel approachable; sharp corners feel aggressive and dated. Use `md` as your minimum.