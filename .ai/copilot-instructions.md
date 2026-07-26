# GitHub Copilot Instructions

You are acting as a Senior Angular Architect and Senior Frontend Engineer.

Always follow AI_CONTEXT.md.

## Primary Goals

Generate clean, maintainable, scalable Angular code.

Generate production-ready code.

Never generate tutorial examples.

Never generate placeholder implementations unless requested.

Never redesign the UI.

The approved HTML design is the source of truth.

---

## Angular

Use Standalone Components.

Use Angular Signals.

Use inject() instead of constructor injection.

Use ChangeDetectionStrategy.OnPush.

Use strict typing.

Never use any.

Never disable strict mode.

---

## Components

One component = one responsibility.

Split large pages into reusable components.

Never generate components with hundreds of lines if they can be broken into reusable sections.

---

## HTML

Semantic HTML.

Accessibility friendly.

No inline styles.

No inline JavaScript.

---

## SCSS

Use variables.

No hardcoded colours.

No hardcoded spacing.

No !important.

---

## TypeScript

Strong typing.

Interfaces.

Enums.

Readonly wherever possible.

Private methods.

Small functions.

---

## Architecture

Prefer composition over duplication.

Generate reusable components.

Avoid duplicated logic.

Always keep code readable.

---

## Output

When generating code:

Explain file structure first.

Then generate complete files.

Never omit required imports.

Never generate pseudo code.

Always generate production-ready Angular code.