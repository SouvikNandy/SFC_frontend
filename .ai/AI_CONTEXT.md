# AI_CONTEXT.md

# SFC Advisor - AI Development Context

## Project Overview

This project is a complete rewrite of the existing SFC Advisor web application.

The client has already approved the UI/UX design. The approved HTML is the design source of truth and must not be redesigned. Future development should preserve the approved visual appearance while converting it into a maintainable Angular application.

The project consists of two major sections:

1. Public Website (Landing Pages)
2. Authenticated Dashboard

This application must be built using modern Angular architecture and production-ready coding practices.

---

# Technology Stack

Framework
- Angular 20+
- Standalone Components
- Angular Signals
- Lazy Loaded Routes

Language
- TypeScript (Strict Mode)

Styling
- SCSS
- CSS Variables
- Responsive Design
- Mobile First

Authentication
- JWT Authentication
- Refresh Token
- Route Guards
- HTTP Interceptor

HTTP
- Angular HttpClient

Package Manager
- npm

IDE
- Visual Studio Code

AI Assistant
- GitHub Copilot

---

# Development Philosophy

Always generate production-quality code.

Never generate tutorial code.

Never generate placeholder code unless explicitly requested.

Write code as if it will be deployed directly to production.

---

# Design Philosophy

The client has already approved the UI.

Never redesign screens.

Never change layouts.

Never invent new colours.

Never invent different spacing.

Never invent different typography.

Maintain visual consistency across the entire application.

The approved HTML is the visual reference.

---

# Angular Standards

Always use Standalone Components.

Never use NgModules unless absolutely required.

Always use:

- inject()
- signal()
- computed()
- effect()

Prefer Angular Signals over RxJS wherever appropriate.

Use ChangeDetectionStrategy.OnPush.

Always use strict typing.

Never use "any".

Never disable TypeScript errors.

---

# Folder Structure

src/

app/

core/

shared/

layouts/

features/

public/

auth/

dashboard/

assets/

images/

icons/

fonts/

scss/

---

# Core Folder

Core contains:

Services

Guards

Interceptors

Models

Constants

Utilities

Core services must only have one instance.

---

# Shared Folder

Shared contains reusable UI components.

Examples

Button

Input

Card

Dialog

Loader

Table

Pagination

Breadcrumb

Header Components

Footer Components

Avatar

Search Box

OTP Input

Shared components must never contain business logic.

---

# Layouts

There are three layouts.

Public Layout

Header

Router Outlet

Footer

Auth Layout

Authentication pages only

Dashboard Layout

Sidebar

Top Bar

Router Outlet

---

# Public Pages

Landing pages include:

Home

About

Services

Blog

Contact

Data

Tools

Login

These pages are publicly accessible.

---

# Dashboard Pages

Dashboard pages require authentication.

Examples

Dashboard Home

Profile

Settings

Subscription

Analytics

Data

Tools

User Management

Future pages should follow the same structure.

---

# Routing

Always lazy load features.

Public routes

/

about

services

blog

contact

data

tools

login

Dashboard routes

/dashboard

/dashboard/profile

/dashboard/settings

/dashboard/subscription

Protect dashboard routes using AuthGuard.

---

# Authentication

JWT Token

Refresh Token

HTTP Interceptor

Auth Guard

Automatic token refresh

Redirect unauthenticated users to Login.

Never store tokens inside components.

Use dedicated Token Storage Service.

---

# Components

Every component should have one responsibility.

Never create huge components.

Break large pages into reusable sections.

Example

Home Page

Hero

Features

Statistics

Testimonials

FAQ

CTA

Footer

Instead of one 2000-line HTML file.

---

# HTML Rules

Use semantic HTML.

Use proper headings.

Use ARIA labels where required.

Do not use inline styles.

Do not use inline JavaScript.

Avoid duplicated markup.

---

# SCSS Rules

Never hardcode colours.

Never hardcode spacing.

Use variables.

Use nesting responsibly.

Maximum nesting:

3 levels.

Follow BEM naming when appropriate.

Avoid !important.

---

# TypeScript Rules

Prefer readonly.

Prefer private members.

Strong typing everywhere.

Interfaces for API models.

Enums for constant values.

Never use magic strings.

Never use magic numbers.

---

# Naming Convention

Components

HomeComponent

HeaderComponent

FooterComponent

HeroComponent

ServicesComponent

Variables

camelCase

Interfaces

PascalCase

Services

AuthService

UserService

ApiService

Files

kebab-case

Example

hero.component.ts

public-layout.component.ts

---

# API Standards

Every API must have:

Request Interface

Response Interface

Service Method

Error Handling

Loading State

Never call HttpClient directly inside components.

Always use Services.

---

# Error Handling

Display user-friendly messages.

Never expose server exceptions.

Log technical errors only in development.

---

# Performance

Lazy load features.

Use OnPush.

Avoid duplicate HTTP requests.

Avoid unnecessary subscriptions.

Track lists properly.

Optimise images.

Optimise bundle size.

---

# Accessibility

Keyboard navigation.

ARIA labels.

Focus management.

Colour contrast.

Screen reader support.

---

# Responsive Design

Desktop

Laptop

Tablet

Mobile

Every page must work across all screen sizes.

Never break desktop layout while fixing mobile.

---

# Code Generation Rules for GitHub Copilot

Whenever generating code:

Follow this document.

Generate only the requested feature.

Do not modify unrelated files.

Do not redesign UI.

Generate maintainable code.

Generate reusable code.

Generate scalable architecture.

Use Angular best practices.

Never create unnecessary complexity.

Always prefer readability.

If uncertain, ask for clarification instead of making assumptions.

---

# Project Goal

The goal is to create a clean, scalable, enterprise-level Angular application that faithfully reproduces the approved UI while following modern Angular architecture and best practices.

Every generated component should be reusable, maintainable, responsive, strongly typed, and production-ready.

# State Management

This project does not use a global state management library.

Do NOT generate:

- NgRx
- NGXS
- Akita
- Redux
- Store
- Effects
- Reducers
- Actions
- Selectors

Use Angular Signals only for component-local UI state.

Application data should come directly from:

- REST APIs
- WebSocket streams

Business logic should live inside Angular services.

Components should remain lightweight and presentation-focused.