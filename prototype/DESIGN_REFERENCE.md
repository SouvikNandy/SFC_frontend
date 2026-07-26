# DESIGN_REFERENCE.md

## Purpose

The file `approved-design.html` is the official UI reference for this project.

Every generated Angular component must preserve the approved visual appearance.

Do not redesign any section.

Do not simplify the layout.

Do not replace sections with placeholder content.

---

## Rules

Before generating any component:

1. Read approved-design.html.

2. Identify the HTML section being requested.

3. Extract only that section.

4. Convert it into an Angular standalone component.

5. Preserve

- spacing
- typography
- alignment
- responsiveness
- animations
- icons
- colours
- card layouts

6. Improve maintainability only.

Do NOT change appearance.

---

## Extraction Rules

Never generate one huge component.

Instead extract into reusable Angular components.

Example

Home Page

↓

Header

↓

Hero

↓

Statistics

↓

Services

↓

Testimonials

↓

CTA

↓

Footer

Each section should become its own standalone Angular component.

---

## Styling

Extract common styles.

Move reusable styles into shared SCSS.

Remove duplicated CSS.

Do not change visual appearance.

---

## HTML

Preserve semantic HTML.

Preserve accessibility.

Preserve responsive behaviour.

Do not change class naming unless required for Angular.

---

## Angular

Replace static HTML with Angular templates.

Replace repeated sections with @for.

Replace conditional sections with @if.

Use Signals when state is required.

Do not introduce unnecessary business logic.