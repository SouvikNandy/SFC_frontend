# DESIGN_SYSTEM.md

# SFC Advisor Design System

## Purpose

This document defines the visual design language for the entire application.

GitHub Copilot must follow these rules when generating UI components.

The approved HTML design is the single source of truth.

Never redesign the UI.

---

# Design Principles

The application should feel:

- Professional
- Premium
- Modern
- Minimal
- Financial
- Clean
- Fast
- Trustworthy

Avoid playful or overly decorative interfaces.

---

# Theme

The UI should maintain one consistent visual identity.

No page should appear visually different from another.

Every component must look like it belongs to the same application.

---

# Color Rules

Never hardcode colors.

Always use SCSS variables.

Example

Primary

Secondary

Success

Warning

Danger

Background

Surface

Border

Text Primary

Text Secondary

Muted Text

Hover

Disabled

Future color values should only exist inside

assets/scss/_variables.scss

---

# Typography

Use one typography system.

Maintain consistent font hierarchy.

Heading 1

Hero headings

Heading 2

Section titles

Heading 3

Card titles

Heading 4

Sub headings

Body

Normal text

Small

Captions

Label

Forms

Button

Buttons

Never randomly change font sizes.

Never mix font weights unnecessarily.

---

# Spacing System

Use one spacing scale.

Example

4px

8px

12px

16px

20px

24px

32px

40px

48px

64px

Never use random spacing values.

Spacing should always use design tokens.

---

# Border Radius

Maintain consistent radius.

Example

Small

Medium

Large

Extra Large

Cards

Buttons

Inputs

Dialogs

Dropdowns

should all follow the same radius system.

---

# Shadows

Use subtle shadows.

Cards

Dropdowns

Dialogs

Floating Elements

should share the same elevation scale.

Avoid excessive shadows.

---

# Buttons

All buttons should follow one system.

Primary Button

Secondary Button

Outline Button

Text Button

Danger Button

Loading Button

Disabled Button

Buttons must share

padding

border radius

font

hover animation

focus style

disabled style

---

# Inputs

Every form field should look identical.

Text Input

Password

Select

Textarea

Checkbox

Radio

OTP

Search

Date Picker

File Upload

Validation messages should be consistent.

---

# Cards

Cards must have

consistent padding

consistent radius

consistent shadow

consistent spacing

consistent typography

No card should look visually different unless intentionally designed.

---

# Icons

Use one icon library throughout the application.

Maintain consistent icon sizes.

Small

Medium

Large

Never mix icon styles.

---

# Tables

Tables should follow one reusable design.

Sticky header

Hover row

Responsive

Pagination

Sorting

Filtering

Selection

Empty State

Loading State

---

# Forms

All forms should share

label spacing

field spacing

validation styling

button placement

error display

loading state

---

# Navigation

Header

Footer

Sidebar

Breadcrumb

Tabs

Menus

must use one navigation language.

Hover behaviour must be consistent.

---

# Responsive Breakpoints

Mobile

Tablet

Laptop

Desktop

Large Desktop

Never redesign components for mobile.

Only rearrange layout.

---

# Animations

Animations should be subtle.

Examples

Fade

Slide

Scale

Hover

Loading

Avoid excessive motion.

Animation duration should remain consistent.

---

# Accessibility

Keyboard accessible.

Screen reader friendly.

Visible focus states.

Sufficient contrast.

Proper ARIA labels.

Semantic HTML.

---

# Reusability

If a UI element appears more than once

Convert it into a Shared Component.

Never duplicate UI.

---

# Copilot Rules

When generating UI

Never invent a new style.

Reuse existing components.

Reuse existing variables.

Reuse spacing tokens.

Reuse typography.

Maintain visual consistency.

Follow this document before generating any HTML or SCSS.