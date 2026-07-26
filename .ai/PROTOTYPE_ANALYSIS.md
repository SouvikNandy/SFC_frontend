# Prototype Analysis — QuantSFC Approved Design

## 1. Overall product structure

The approved prototype is a single-file, state-driven UI mockup for a multi-surface trading platform. It combines three distinct experiences in one flow:

1. Public marketing / information site
2. Authentication experience
3. Authenticated dashboard / analytics shell

The implementation is intentionally modular from a visual perspective, even though it is delivered as one HTML file. The structure is already well-suited to an Angular conversion into standalone pages, layouts, feature modules, and shared UI components.

## 2. Page structure and section order

### A. Public experience
The public experience is the first entry point and is designed to market the brand, explain services, and invite users to sign up.

1. Sticky public header
   - Logo / brand area
   - Navigation pills for Home, About, Services, Blog, Contact, Data, Tools
   - Primary login CTA

2. Hero section
   - Large green-themed hero banner with headline, supporting copy, CTAs, and a market snapshot card

3. About / trust section
   - Value proposition and experience summary
   - Three compact stat cards

4. Services section
   - Feature cards for consulting, training, and analysis tools

5. Testimonial / social proof band
   - Large quote card with a client testimonial

6. Platform highlights section
   - Card-based teaser list for EOD data, tools, and portfolio features

7. CTA footer band
   - “Get started” call to action

8. Public footer
   - Copyright line and secondary navigation links

### B. Authentication experience
The authentication experience is a split-screen layout:

- Left pane: branded hero with product messaging and value props
- Right pane: form switcher for login / registration / OTP verification

It includes:
- Login form
- Register form
- OTP verification form
- Social sign-in buttons
- Error-state inline validation
- Demo-style toast feedback

### C. Dashboard shell
Once authenticated, the app loads a fully functional dashboard shell with:

- Left sidebar navigation
- Top bar with page title and date/status chip
- Ticker tape strip
- Main content area that swaps between multiple feature pages

The dashboard is state-driven and includes a command palette overlay for quick navigation.

## 3. Navigation structure

### Public navigation
The public site uses a pill-based horizontal navigation:
- Home
- About
- Services
- Blog
- Contact
- Data
- Tools

### Dashboard navigation
The authenticated app uses a sidebar with grouped navigation:

- Trading
  - Home
  - Portfolio
  - Options Chain
  - F&O EOD Data
  - Closed Trades

- Tools
  - Greeks Calculator
  - Probability Calculator
  - Historical Volatility
  - Implied Volatility
  - Payoff Simulator

- More
  - Blog & Reports
  - Price Alerts

### Command palette
There is a keyboard shortcut overlay for fast navigation using Ctrl/Cmd + K.

## 4. Footer structure

The public site contains a simple footer with:
- Copyright notice: “© 2026 QuantSFC — quantsfc.com”
- Secondary navigation links to the main public pages

The dashboard shell does not use a footer; the content area is the primary surface.

## 5. Major UI sections inside the dashboard

The app shell is organized around the following sections:

1. Home
   - Market summary cards
   - Quick links to the primary tools
   - Platform overview text card

2. Portfolio
   - Summary cards for P&L, market value, margin, and number of positions
   - Open positions table
   - Add trade and exit trade modal flows

3. Options Chain
   - Symbol switcher for NIFTY and BANKNIFTY
   - Expiry selector
   - Spot price summary
   - Option-chain statistics cards
   - Large table for call/put data
   - OI bar chart and IV smile chart
   - CSV export

4. Greeks Calculator
   - Input form for spot, strike, days, IV, and rate
   - Black-Scholes-based outputs for price, delta, gamma, theta, vega, rho
   - Interactive chart of theoretical price versus spot

5. Probability Calculator
   - Probability of finishing above / below a target price
   - Expected range chart
   - Probability distribution visualization

6. Historical Volatility
   - 10/20/30-day realised volatility cards
   - Price chart of recent closes
   - Rolling HV table
   - CSV export

7. Implied Volatility
   - IV smile chart for selected strike
   - Strike-based IV table
   - Symbol and type switchers

8. Payoff Simulator
   - Multi-leg strategy builder
   - Add/remove leg form
   - Payoff chart and breakeven summary

9. F&O EOD Data
   - Symbol / instrument / strike / expiry / date-range controls
   - Price chart for historical series
   - Data table with open/high/low/close/volume/OI
   - CSV export

10. Blog & Reports
    - Article cards
    - Sticky subscribe panel
    - Report download action

11. Price Alerts
    - Alert creation form
    - Active alerts table
    - Delete action

12. Closed Trades
    - Summary metrics for realised P&L, win rate, holding period
    - Closed trades table

## 6. Card types used throughout the prototype

The prototype uses a consistent card system with several recurring variants:

- Hero cards
  - Large immersive marketing cards with dark green backgrounds
  - Used for the public landing hero and auth hero panel

- Stat cards
  - Small compact tiles showing metrics such as experience, P&L, IV, and volatility

- Content cards
  - Standard white cards with rounded corners, borders, and subtle elevation
  - Used for summaries, service descriptions, and feature teasers

- Feature cards
  - Hoverable cards for marketing content and tool highlight tiles

- Panel cards
  - Slightly larger cards for charts, tables, and interactive modules

- Modal cards
  - Overlay-based forms for Add Trade and Exit Trade flows

- CTA cards
  - Strong accent-background cards for conversion actions

## 7. Button styles

Buttons are highly consistent and fall into a few clear patterns:

- Primary action button
  - Filled accent green background
  - White text
  - Rounded corners
  - Used for login, create account, submit, and primary CTA actions

- Secondary button
  - Transparent or light background with outlined border
  - Used for “Back”, “Cancel”, “Subscribe”, and secondary actions

- Ghost / text button
  - Minimal styling, often used for delete actions, remove leg actions, or inline actions

- Pill buttons
  - Used in the public navigation and dashboard tabs

- Icon buttons
  - Small circular or square controls for header actions, sidebar close, and add/remove actions

## 8. Form patterns

The prototype uses a small but reusable set of form patterns:

- Login form
  - Email/phone input
  - Password input
  - Validation errors
  - Forgot password link
  - Social login buttons

- Registration form
  - Full name, email, phone, password
  - Inline validation states

- OTP form
  - Two 6-digit code fields
  - Verification action
  - Resend link

- Contact form
  - Name, email, message
  - Submit action

- Subscribe form
  - Email input and subscribe button

- Alert creation form
  - Symbol selector, condition selector, target input

- Trade management forms
  - Add trade modal with symbol, sub-label, quantity, entry price
  - Exit trade modal with exit price

- Payoff leg form
  - Option type selector, buy/sell selector, strike, premium, quantity

## 9. Reusable UI elements

Several UI primitives appear repeatedly and should be extracted as shared Angular components:

- Card container
- Stat tile
- Section heading / eyebrow label
- Icon badge chip
- Primary/secondary button variants
- Input field style
- Mini input style for compact forms
- Table wrapper with responsive overflow handling
- Modal overlay / command palette overlay
- Toast notification
- Sidebar nav item
- Top bar / ticker bar shell

## 10. Repeated design patterns

The prototype repeats a small set of layout and interaction patterns across all sections:

- Grid-based content layout with helper classes like sfc-grid-2, sfc-grid-3, sfc-grid-4, sfc-grid-5
- Two-column content arrangement using sfc-side-content and sfc-two-col-blog
- Consistent card spacing and border radius
- Header + summary + table/chart structure for analytics modules
- Input + action button structure for forms
- Summary metric row followed by charts/tables for data-heavy modules
- Sticky or overlay secondary panels for related actions

## 11. Images and media usage

The prototype uses very little traditional imagery:

- One embedded logo image rendered from a base64 data URL
- SVG-based charts and decorative shapes
- Inline SVG icons used for navigation, features, and UI actions

There are no external photos or image assets in the prototype.

## 12. Icons used

Icons are mostly inline SVGs, not icon fonts. They appear in:

- Sidebar navigation
- Public feature cards
- Public hero and service sections
- Auth screen feature bullets
- Action buttons and table actions
- Chart legends and decorative indicators

Common visual motifs include:
- House / dashboard
- Portfolio / chart / growth icons
- Option chain / table / data icons
- Alert / bell symbols
- Check / status indicators
- Social sign-in iconography

## 13. Animations and motion styles

The prototype uses light motion to reinforce interactivity:

- Fade-in animation for screens and forms
- Hover lift effect on public cards
- Sidebar slide-in transition on mobile
- Ticker tape scrolling animation
- Toast show/hide transition
- Spinner for loading states
- Focus-outline transitions for keyboard accessibility
- Smooth hover transitions on nav items and cards

A reduced-motion fallback is already present for the ticker animation.

## 14. Responsive behavior

Responsive behavior is implemented with two main breakpoints:

- 880px: switches to a mobile-friendly layout
  - Sidebar becomes an off-canvas drawer
  - Main content stacks vertically
  - Grid layouts collapse into fewer columns
  - Hero panels stack vertically
  - Public page layout goes single-column

- 520px: further collapses to a one-column layout
  - Tables become horizontally scrollable
  - Buttons and cards remain full-width where appropriate
  - Command palette padding is reduced

The layout is designed to remain functional even when media queries are stripped or overridden, with a JavaScript-driven fallback for layout adaptation.

## 15. Third-party libraries referenced

The prototype references the following external assets:

- Google Fonts
  - Sora
  - Work Sans
  - IBM Plex Mono

No external JavaScript frameworks or UI libraries are used. The prototype is native HTML/CSS/JavaScript.

## 16. CSS dependencies and design system notes

The styles rely on a custom design system built around CSS variables:

- Neutral background and panel colors
- Soft green accent system
- Strong success and error states
- Consistent spacing and radius scale
- Typography tokens for display, body, and mono usage
- Border and shadow tokens
- Reusable helpers for grids, cards, inputs, and responsive behavior

The design language is highly consistent and should map cleanly to Angular component styles and SCSS design tokens.

## 17. JavaScript dependencies and behavior patterns

The prototype uses native JavaScript with a small set of state-driven behaviors:

- A central state object controlling page, section, auth flow, and module data
- Helper functions for formatting, escaping, toast messaging, CSV export, and chart path generation
- Synthetic datasets for:
  - options chain data
  - EOD series data
  - closed trades
  - blog posts
  - alerts
- Black-Scholes helper functions for Greeks, pricing, and IV-related calculations
- Seeded random generation for synthetic option EOD series
- DOM event handlers for navigation, form submission, modal toggles, and export actions

## 18. Angular implementation implications

From an implementation standpoint, this prototype is best converted into:

- Shared layout components for public, auth, and dashboard shells
- Feature components for each dashboard module
- Shared UI primitives for cards, buttons, forms, tables, and overlays
- A core state and service layer for analytics data and navigation
- SCSS tokens and shared utility classes aligned with the prototype’s visual language

The current prototype is already structured in a way that maps naturally to a feature-based Angular architecture with standalone routing and reusable UI composition.
