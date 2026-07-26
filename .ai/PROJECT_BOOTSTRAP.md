# PROJECT_BOOTSTRAP.md

# SFC Advisor - Project Bootstrap Guide

## Objective

Bootstrap the Angular project with a clean, scalable, production-ready architecture before implementing any UI or business functionality.

This phase focuses only on project setup.

Do not generate business logic, API implementations, or application pages.

---

# Technology Stack

Framework
- Angular 20+
- Standalone Components
- Angular Signals (Component State Only)

Language
- TypeScript (Strict Mode)

Styling
- SCSS

Authentication
- JWT

Communication
- REST APIs
- WebSockets

Package Manager
- npm

IDE
- Visual Studio Code

---

# Architecture Principles

The project must follow Feature-Based Architecture.

Use

- Core
- Shared
- Layouts
- Features

Avoid unnecessary abstraction.

Do not introduce NgRx, NGXS, Akita, Redux, or any other state management library.

Use Angular Signals only for local component state.

Application data should come directly from REST APIs and WebSocket services.

---

# Bootstrap Tasks

Complete the following tasks in order.

1. Create project folder structure.

2. Create layout components.

3. Configure application routing.

4. Configure SCSS architecture.

5. Configure shared component folders.

6. Configure core services.

7. Configure models.

8. Configure environment files.

9. Configure assets.

10. Ensure project builds successfully.

---

# Folder Structure

Create the following architecture.

src/

app/

core/

config/

constants/

enums/

guards/

interceptors/

models/

services/

utils/

validators/

shared/

components/

directives/

pipes/

interfaces/

types/

layouts/

public-layout/

auth-layout/

dashboard-layout/

features/

public/

home/

about/

services/

blog/

contact/

tools/

data/

auth/

login/

verify-otp/

forgot-password/

reset-password/

dashboard/

dashboard-home/

profile/

settings/

subscription/

analytics/

reports/

assets/

fonts/

icons/

images/

illustrations/

animations/

lottie/

scss/

abstracts/

base/

components/

layout/

pages/

themes/

utilities/

---

# Layouts

Create three layouts.

## Public Layout

Contains

- Header
- Router Outlet
- Footer

---

## Auth Layout

Contains

- Router Outlet

Authentication screens only.

---

## Dashboard Layout

Contains

- Sidebar
- Topbar
- Router Outlet

---

# Routing

Configure routing only.

Do not implement pages.

Public Routes

/

about

services

blog

contact

tools

data

login

Dashboard Routes

/dashboard

/dashboard/profile

/dashboard/settings

/dashboard/subscription

/dashboard/reports

/dashboard/analytics

Requirements

- Lazy Loading
- AuthGuard for dashboard
- Redirect unknown routes to Home

---

# Shared Components

Create folders only.

Do not implement UI.

button/

card/

dialog/

drawer/

loader/

spinner/

input/

textarea/

select/

checkbox/

radio/

otp-input/

badge/

avatar/

breadcrumb/

pagination/

table/

empty-state/

error-state/

page-header/

section-title/

---

# Core Services

Create service files only.

Do not implement business logic.

ApiService

AuthService

StorageService

NotificationService

LoaderService

ThemeService

NavigationService

WebSocketService

LoggingService

---

# Models

Create folders only.

auth/

api/

common/

dashboard/

user/

---

# SCSS Architecture

Create

assets/scss/

abstracts/

_variables.scss

_mixins.scss

_functions.scss

base/

_reset.scss

_typography.scss

_globals.scss

layout/

_container.scss

_grid.scss

_header.scss

_footer.scss

_sidebar.scss

components/

_button.scss

_card.scss

_input.scss

_table.scss

_modal.scss

utilities/

_spacing.scss

_display.scss

_flex.scss

_text.scss

themes/

_theme.scss

styles.scss

Configure styles.scss to import all partials.

---

# Assets

Create folders.

fonts/

icons/

images/

illustrations/

animations/

lottie/

mock-data/

---

# Angular Standards

Always use

Standalone Components

inject()

Signals

OnPush Change Detection

Strict TypeScript

Never use

NgModules

any

constructor injection unless required

inline CSS

inline JavaScript

---

# Services

Business logic belongs inside services.

Components should remain lightweight.

Components must never communicate directly with HttpClient.

REST communication should use ApiService.

Real-time communication should use WebSocketService.

---

# Bootstrap Restrictions

Do NOT

Implement APIs

Create forms

Create DTOs

Generate business logic

Copy prototype HTML

Generate page content

Create mock data

Implement authentication

Generate reusable UI

Bootstrap only prepares the project.

---

# Expected Result

The project should

✅ Compile successfully

✅ Have clean folder structure

✅ Have layouts

✅ Have routing configured

✅ Have SCSS architecture

✅ Have placeholder services

✅ Have placeholder components

✅ Be ready to start converting the approved HTML prototype into Angular components

No feature implementation should exist at the end of bootstrap.

---

# Success Criteria

Bootstrap is complete only when

- Folder structure exists
- Layouts compile
- Routes compile
- SCSS compiles
- Placeholder services exist
- Placeholder shared components exist
- Application runs without errors
- Project is ready for UI development