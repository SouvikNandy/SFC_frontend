# Design Tokens — QuantSFC Prototype

This document is the single source of truth for the SCSS design system derived from the approved HTML prototype.

It captures the visual system used by the prototype so the Angular implementation can stay visually faithful without introducing new design decisions.

## 1. Colour palette

The prototype uses a restrained financial palette built around green accents, neutral surfaces, and strong semantic states.

### Core semantic palette

| Token | Value | Usage |
| --- | --- | --- |
| $color-bg | #F8FAF7 | App background |
| $color-panel | #FFFFFF | Main surfaces |
| $color-panel-alt | #EAF4E4 | Alternate surface / hover state |
| $color-head-bg | #F1F7EC | Header/table header background |
| $color-border | #DDE7D8 | Default borders |
| $color-input-border | #C9D8C0 | Form field border |
| $color-ink | #2B2B2B | Primary text |
| $color-ink-soft | #3A4434 | Secondary text |
| $color-muted | #5C6B55 | Muted content |
| $color-muted-2 | #8B9884 | Extra-muted labels |

### Brand and state palette

| Token | Value | Usage |
| --- | --- | --- |
| $color-accent | #7FA76A | Primary interactive accent |
| $color-accent-dark | #6E9759 | Accent hover / stronger variant |
| $color-accent-tint | rgba(127, 167, 106, 0.12) | Accent soft backgrounds |
| $color-teal | #178A4C | Success / positive state |
| $color-teal-dark | #12703C | Strong success state |
| $color-teal-tint | rgba(23, 138, 76, 0.10) | Positive soft fill |
| $color-teal-glow | rgba(23, 138, 76, 0.14) | Focus / glow |
| $color-red | #C0342A | Danger / negative state |
| $color-red-tint | rgba(192, 52, 42, 0.10) | Negative soft fill |
| $color-hero-bg | #2E4D12 | Hero surface |
| $color-hero-text | #F5F8F2 | Hero text |
| $color-hero-muted | #C7DBB9 | Hero secondary text |
| $color-hero-stat-muted | #8FAE7C | Hero stat caption |
| $color-accent-ink | #FFFFFF | Text on accent buttons |
| $color-green-dot | #178A4C | Status dot |

### Semantic usage guidance

- Use $color-accent for primary CTA and active states.
- Use $color-teal for positive metrics and success feedback.
- Use $color-red for negative metrics and destructive actions.
- Use $color-hero-bg for the dark green hero panels.
- Use $color-panel and $color-panel-alt for card and section surfaces.

## 2. Typography

The typography system is built around three families and a strict hierarchy.

### Font families

| Token | Value |
| --- | --- |
| $font-display | 'Sora', sans-serif |
| $font-body | 'Work Sans', sans-serif |
| $font-mono | 'IBM Plex Mono', monospace |

### Font sizes

The prototype uses a practical scale with strong emphasis on readable body copy and compact UI labels.

| Token | Value |
| --- | --- |
| $font-size-10 | 10px |
| $font-size-10-5 | 10.5px |
| $font-size-11 | 11px |
| $font-size-11-5 | 11.5px |
| $font-size-12 | 12px |
| $font-size-12-5 | 12.5px |
| $font-size-13 | 13px |
| $font-size-13-5 | 13.5px |
| $font-size-14 | 14px |
| $font-size-14-5 | 14.5px |
| $font-size-15 | 15px |
| $font-size-15-5 | 15.5px |
| $font-size-16 | 16px |
| $font-size-16-5 | 16.5px |
| $font-size-18 | 18px |
| $font-size-19 | 19px |
| $font-size-20 | 20px |
| $font-size-22 | 22px |
| $font-size-24 | 24px |
| $font-size-26 | 26px |
| $font-size-27 | 27px |
| $font-size-28 | 28px |
| $font-size-30 | 30px |
| $font-size-34 | 34px |
| $font-size-38 | 38px |
| $font-size-54 | 54px |
| $font-size-70 | 70px |

### Font weights

| Token | Value |
| --- | --- |
| $font-weight-400 | 400 |
| $font-weight-500 | 500 |
| $font-weight-600 | 600 |
| $font-weight-700 | 700 |
| $font-weight-800 | 800 |

### Typography usage patterns

- Display typography: large marketing headings and hero titles
- Body typography: form labels, paragraph copy, table cells, and cards
- Mono typography: prices, numbers, tables, and compact metrics

## 3. Border radius

The prototype uses a rounded, slightly soft visual language.

| Token | Value | Usage |
| --- | --- | --- |
| $radius-4 | 4px | Small chips / tight elements |
| $radius-5 | 5px | Tags and small badges |
| $radius-6 | 6px | Buttons and small controls |
| $radius-7 | 7px | Tab pills and compact buttons |
| $radius-8 | 8px | Inputs and small cards |
| $radius-9 | 9px | Forms and compact CTAs |
| $radius-10 | 10px | Buttons and toast |
| $radius-12 | 12px | Command palette box and larger controls |
| $radius-14 | 14px | Standard cards and content panels |
| $radius-18 | 18px | Public feature cards and larger marketing cards |
| $radius-20 | 20px | Hero panels and large surfaces |
| $radius-full | 999px | Pill nav and CTA pills |

## 4. Shadows

Shadows are subtle and restrained, with soft elevation for cards and overlay surfaces.

| Token | Value | Usage |
| --- | --- | --- |
| $shadow-sm | 0 1px 2px rgba(20, 40, 15, 0.04) | Low-elevation cards |
| $shadow-md | 0 10px 26px -14px rgba(20, 50, 15, 0.12) | Standard hover elevation |
| $shadow-lg | 0 20px 44px -18px rgba(20, 50, 15, 0.24) | Elevated interactive cards |
| $shadow-overlay | 0 20px 50px rgba(18, 20, 26, 0.18) | Command palette and dialog overlays |
| $shadow-sidebar | 20px 0 40px rgba(18, 20, 26, 0.18) | Mobile sidebar drawer |

## 5. Spacing scale

The design uses a compact spacing scale that supports dense data layouts and generous marketing sections.

| Token | Value |
| --- | --- |
| $space-2 | 2px |
| $space-4 | 4px |
| $space-6 | 6px |
| $space-7 | 7px |
| $space-8 | 8px |
| $space-9 | 9px |
| $space-10 | 10px |
| $space-12 | 12px |
| $space-14 | 14px |
| $space-16 | 16px |
| $space-18 | 18px |
| $space-20 | 20px |
| $space-22 | 22px |
| $space-24 | 24px |
| $space-28 | 28px |
| $space-30 | 30px |
| $space-32 | 32px |
| $space-34 | 34px |
| $space-36 | 36px |
| $space-40 | 40px |
| $space-44 | 44px |
| $space-48 | 48px |
| $space-52 | 52px |
| $space-56 | 56px |
| $space-60 | 60px |
| $space-64 | 64px |
| $space-72 | 72px |

## 6. Breakpoints

The responsive system is based on two primary breakpoints.

| Token | Value | Usage |
| --- | --- | --- |
| $breakpoint-mobile | 880px | Sidebar becomes drawer; layouts stack |
| $breakpoint-small | 520px | Single-column fallback; tighter spacing |

## 7. Button styles

Buttons are highly consistent and should be implemented through reusable variants.

### Primary button

- Background: $color-accent
- Text: $color-accent-ink
- Border: none
- Radius: 9px to 10px, or full pill for nav/CTA
- Padding: 11px–13px for compact actions; 13px–24px for full CTAs
- Font size: 13.5px–15px
- Font weight: 600

### Secondary button

- Background: transparent or $color-panel
- Border: 1.5px solid $color-input-border
- Text: $color-ink-soft
- Radius: 8px to 10px

### Ghost / text button

- Background: transparent
- Border: none
- Text: $color-muted or $color-red
- Padding: compact inline actions

### Dangerous button

- Background: $color-red
- Text: #FFFFFF
- Radius: 9px

### Disabled button

- Opacity: 0.75
- Cursor: not-allowed

### Focus style

- Outline: 2px solid $color-accent
- Outline offset: 1px

## 8. Input styles

Form controls repeatedly use the same visual treatment.

| Element | Style |
| --- | --- |
| Input / select / textarea | Width 100%, border 1.5px solid $color-input-border, radius 8px–9px, background $color-panel or $color-panel-2, padding 10px 12px or 12px 14px |
| Placeholder | #B7BAC1 |
| Focus | 2px accent outline |
| Error state | Border color $color-red, error message visible |
| OTP input | Center aligned, mono font, letter spacing 6px |

## 9. Card styles

Cards are the main surface pattern for content, metrics, and dashboard modules.

| Token | Value |
| --- | --- |
| $card-bg | #FFFFFF |
| $card-border | 1px solid $color-border |
| $card-radius | 14px |
| $card-padding | 22px 24px |
| $card-padding-compact | 16px 18px |
| $card-padding-large | 24px 28px |
| $card-shadow | 0 1px 2px rgba(20, 40, 15, 0.04), 0 10px 26px -14px rgba(20, 50, 15, 0.12) |

### Card behavior

- Standard cards use a soft border and subtle shadow.
- Hovered marketing cards elevate slightly and change border color to accent.
- Hero cards use dark green backgrounds with light text.

## 10. Container widths

The prototype uses a mix of full-width layouts and constrained content containers.

| Context | Width / Constraint |
| --- | --- |
| Sidebar | 224px desktop, 264px mobile |
| Command palette | max-width 480px |
| Auth form column | max-width 400px |
| Public content sections | padding 36px desktop, 24px mobile |
| Contact / content wrap | max-width 980px |
| About / services content | max-width 800px |
| Hero content | max-width 680px |
| Modal dialog | max-width 400px–420px |

## 11. Grid system

The layout uses a small set of reusable grid classes.

| Class | Definition |
| --- | --- |
| .sfc-grid-2 | 2 equal columns, gap 14px |
| .sfc-grid-3 | 3 equal columns, gap 14px |
| .sfc-grid-4 | 2fr 1fr 1fr 1fr, gap 14px |
| .sfc-grid-5 | 5 equal columns, gap 14px |
| .sfc-side-content | 340px sidebar column + 1fr content, gap 20px |
| .sfc-two-col-blog | 1fr content + 320px sidebar, gap 24px |
| .sfc-auth-grid | 2-column auth split, 1-column on mobile |

### Responsive column behavior

- At 880px and below: content stacks into one column.
- At 520px and below: all grids collapse to one column.

## 12. Z-index values

| Token | Value | Usage |
| --- | --- | --- |
| $z-index-dropdown | 50 |
| $z-index-backdrop | 390 |
| $z-index-sidebar | 400 |
| $z-index-command-palette | 500 |
| $z-index-toast | 999 |

## 13. Transition durations

The prototype uses short, polished motion timings.

| Token | Value | Usage |
| --- | --- | --- |
| $transition-fast | 0.12s |
| $transition-base | 0.14s |
| $transition-medium | 0.16s |
| $transition-slow | 0.18s |
| $transition-panel | 0.2s |
| $transition-slide | 0.22s |
| $transition-fade | 0.3s |

## 14. Animation timings

| Animation | Timing | Notes |
| --- | --- | --- |
| fadeIn | 0.3s ease both | Used for screen/form emergence |
| spin | 0.7s linear infinite | Loading indicator |
| scrollTicker | 34s linear infinite | Continuous ticker strip |
| reduced-motion fallback | none | Respect prefers-reduced-motion |

## 15. Recommended SCSS token naming

To keep the SCSS system consistent, the following naming convention should be used:

- Colors: $color-*
- Typography: $font-*, $font-size-*, $font-weight-*
- Radius: $radius-*
- Shadow: $shadow-*
- Spacing: $space-*
- Breakpoints: $breakpoint-*
- Z-index: $z-index-*
- Motion: $transition-*

## 16. Implementation notes for SCSS

- Define all values in SCSS variables and reuse them across components.
- Avoid hard-coded colors, spacing, or typography values inside component styles.
- Keep the hero, card, button, and form systems aligned to these tokens.
- Prefer the documented radius, shadow, and spacing scale over ad-hoc values.
- Treat the prototype as the visual source of truth and preserve the same look and feel in Angular.
