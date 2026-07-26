# FOLDER_RULES.md

# Folder Responsibilities

This document defines exactly what belongs inside every folder.

GitHub Copilot must follow these rules.

---

# app/

Contains only Angular application code.

Never place assets here.

---

# core/

Purpose

Application-wide singleton services.

Contains

Guards

Interceptors

Services

Models

Constants

Utilities

Enums

Configuration

Rules

Never place reusable UI here.

Never place feature components here.

Never place page components here.

---

# shared/

Purpose

Reusable UI.

Contains

Button

Input

Card

Dialog

Table

Loader

Spinner

Avatar

Pagination

Breadcrumb

Header Components

Footer Components

Search Box

OTP Component

Rules

Shared components must never contain business logic.

Shared components should be reusable across multiple features.

---

# layouts/

Purpose

Application layouts.

Contains

Public Layout

Dashboard Layout

Auth Layout

Rules

Layouts should only manage structure.

They should not contain business logic.

---

# features/

Purpose

Business modules.

Contains

Public

Auth

Dashboard

Each feature owns its own components.

---

# features/public/

Contains

Home

About

Services

Blog

Contact

Data

Tools

Rules

Only landing pages.

---

# features/auth/

Contains

Login

Register

Verify OTP

Forgot Password

Reset Password

Authentication Services

Rules

No dashboard code.

---

# features/dashboard/

Contains

Dashboard Home

Profile

Subscription

Settings

Analytics

Reports

Data

Tools

Rules

Dashboard only.

---

# assets/

Purpose

Static resources.

Contains

Images

Icons

Fonts

SCSS

Never place TypeScript here.

---

# assets/scss/

Contains

Variables

Mixins

Typography

Buttons

Forms

Layout

Utilities

Theme

Never create component-specific SCSS here.

---

# environments/

Contains

Environment Configuration

API URLs

Feature Flags

Version

Rules

Never hardcode URLs anywhere else.

---

# models/

Contains

Interfaces

DTOs

Enums

Types

Rules

Business models only.

---

# services/

Contains

API communication.

Business services.

Authentication.

Storage.

Rules

Components should never access HttpClient directly.

---

# guards/

Contains

Auth Guard

Role Guard

Permission Guard

Guest Guard

---

# interceptors/

Contains

JWT Interceptor

Refresh Token Interceptor

Error Interceptor

Loading Interceptor

Logging Interceptor

---

# pipes/

Reusable pipes only.

---

# directives/

Reusable directives only.

---

# utils/

Pure helper functions.

Formatting.

Calculations.

Parsing.

Validation helpers.

No Angular dependencies.

---

# constants/

Application constants.

Never hardcode values.

---

# pages

Feature entry pages.

Should compose reusable components.

Example

Home Page

↓

Hero Component

↓

Feature Cards

↓

Statistics

↓

Testimonials

↓

Footer

Never build one huge page component.

---

# Components

One responsibility.

Small.

Reusable.

Readable.

Independent.

---

# Rules for GitHub Copilot

Before generating any file

Determine the correct folder.

Never place files in the wrong location.

Never duplicate components.

Prefer shared components whenever possible.

Follow the folder structure.

If a component can be reused

Place it inside shared.

If a component belongs only to one page

Place it inside that feature.

If uncertain

Prefer composition over duplication.