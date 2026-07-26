# Prototype Section Index

This document inventories the approved prototype HTML into Angular-friendly sections and reusable UI patterns. It is architecture-only documentation and does not generate Angular code or implement any UI.

## 1. High-level experience map

The prototype is organized around three distinct experiences:

1. Public marketing experience
   - Landing page, about, services, tools, contact, blog, and free EOD data preview.
2. Authentication experience
   - Login, registration, and OTP verification flows.
3. Authenticated application experience
   - A dashboard shell with portfolio, options chain, calculators, EOD data, reports, alerts, and closed trades.

---

## 2. Major sections and suggested Angular component names

| Area | Prototype section | Suggested Angular component name | Notes |
| --- | --- | --- | --- |
| Public shell | Sticky header and public navigation | PublicShellComponent | Shared top-level wrapper for all public pages. |
| Public shell | Public footer | PublicFooterComponent | Good candidate for a shared footer. |
| Public home | Hero section | PublicHeroSectionComponent | Strong standalone section with its own CTA and visual treatment. |
| Public home | Intro/about preview | PublicIntroSectionComponent | Good reusable section for narrative content. |
| Public home | Service cards grid | PublicServiceCardGridComponent | Repeated card pattern. |
| Public home | Testimonial / quote band | TestimonialBandComponent | Could be shared across pages later. |
| Public home | Feature / platform cards | FeatureCardGridComponent | Repeated card list pattern. |
| Public about | About hero | PublicHeroSectionComponent | Same hero pattern as home but different copy. |
| Public about | Values / principles cards | ValueCardGridComponent | Repeated card layout. |
| Public about | Team / expertise cards | TeamExpertiseCardGridComponent | Repeated card layout with icon + title + description. |
| Public services | Services page hero | PublicHeroSectionComponent | Reusable hero variant. |
| Public services | Consulting and training sections | ServiceListSectionComponent | A good content-driven section component. |
| Public tools | Tools landing grid | ToolCardGridComponent | Strong candidate for reuse with other card grids. |
| Public contact | Contact form and contact info | ContactSectionComponent | Contains a form plus supporting info cards. |
| Public blog | Blog / reports list | BlogPostListComponent | Good reusable module for article-style content. |
| Public blog | Subscribe card | NewsletterSubscribeCardComponent | Repeated form/card pattern. |
| Public EOD preview | Free data teaser banner | EodPreviewBannerComponent | Short intro section for the public experience. |
| Auth shell | Auth split layout | AuthLayoutComponent | Strong shell for login/register/OTP onboarding. |
| Auth hero | Marketing/benefit panel | AuthHeroPanelComponent | A large left-side hero with value props. |
| Auth form | Login form | LoginFormComponent | Contains email/phone, password, social buttons, and links. |
| Auth form | Register form | RegisterFormComponent | Contains validation-driven form fields. |
| Auth form | OTP verification step | OtpVerificationStepComponent | Standalone step in the auth flow. |
| App shell | Main dashboard layout | DashboardLayoutComponent | Core shell for all authenticated modules. |
| App shell | Sidebar navigation | SidebarNavComponent | Shared navigation for the dashboard. |
| App shell | Top bar | TopBarComponent | Shared header for the app experience. |
| App shell | Ticker tape | TickerTapeComponent | Reusable top strip for market summary. |
| App shell | Command palette | CommandPaletteComponent | Reusable overlay navigation tool. |
| Dashboard home | Welcome header | DashboardWelcomeHeaderComponent | Good top-of-page summary block. |
| Dashboard home | Market summary cards | SummaryMetricCardGridComponent | Repeated stat cards. |
| Dashboard home | Quick links grid | QuickActionCardGridComponent | Repeated card grid. |
| Dashboard home | Platform overview panel | PlatformOverviewPanelComponent | A content card with supporting copy. |
| Portfolio | Portfolio summary cards | PortfolioSummaryCardGridComponent | Repeated summary cards. |
| Portfolio | Open positions table | PortfolioTableComponent | Strong reusable data table component. |
| Portfolio | Add trade modal | AddTradeModalComponent | Modal with form fields and action buttons. |
| Portfolio | Exit trade modal | ExitTradeModalComponent | Modal for trade exit flow. |
| Options chain | Symbol selector and filters | ChainFilterBarComponent | Shared control bar pattern. |
| Options chain | Summary stat cards | SummaryMetricCardGridComponent | Same card pattern as dashboard home. |
| Options chain | Options chain table | OptionChainTableComponent | Complex but clearly reusable table. |
| Options chain | OI bar chart | OpenInterestChartComponent | Chart panel. |
| Options chain | IV smile chart | IvSmileChartComponent | Chart panel. |
| Greeks | Input form | GreeksCalculatorFormComponent | Contains numeric inputs and tabbed selectors. |
| Greeks | Summary metric cards | SummaryMetricCardGridComponent | Reused stat card layout. |
| Greeks | Price chart | GreeksChartCardComponent | Generic chart card. |
| Greeks | Metrics table | MetricsTableComponent | Reusable detail table. |
| Probability | Input form | ProbabilityCalculatorFormComponent | Repeated calculator form structure. |
| Probability | Summary stat cards | SummaryMetricCardGridComponent | Reused stat card layout. |
| Probability | Probability distribution chart | ProbabilityChartComponent | Good standalone chart section. |
| Probability | Result table | MetricsTableComponent | Same table structure as Greeks. |
| Historical Volatility | Symbol switcher | SymbolToggleGroupComponent | Repeated segmented control style. |
| Historical Volatility | HV summary cards | SummaryMetricCardGridComponent | Reused stat card layout. |
| Historical Volatility | Price chart | HistoricalPriceChartComponent | Reusable chart card. |
| Historical Volatility | Rolling HV table | VolatilityTableComponent | Reusable data table. |
| Implied Volatility | Filter controls | IvFilterBarComponent | Selection controls for symbol/type/strike. |
| Implied Volatility | IV summary cards | SummaryMetricCardGridComponent | Reused stat card layout. |
| Implied Volatility | IV smile chart | IvSmileChartComponent | Reused from options chain. |
| Implied Volatility | IV by strike table | IvStrikeTableComponent | Clear data table. |
| Payoff simulator | Leg builder form | PayoffLegFormComponent | Form for adding a strategy leg. |
| Payoff simulator | Legs table | PayoffLegTableComponent | Repeated table/list pattern. |
| Payoff simulator | Payoff chart | PayoffChartComponent | Standalone chart section. |
| EOD data | Filter controls | EodFilterBarComponent | Complex filter control panel. |
| EOD data | EOD chart | EodPriceChartComponent | Chart card. |
| EOD data | EOD data table | EodDataTableComponent | Data table. |
| Blog & reports | Blog card list | BlogPostCardListComponent | Repeated article-card structure. |
| Blog & reports | Subscription card | NewsletterSubscribeCardComponent | Same as public blog subscribe card. |
| Alerts | New alert form | AlertFormComponent | Form with selects and numeric input. |
| Alerts | Alerts table | AlertsTableComponent | Reusable table display. |
| Closed trades | Summary cards | SummaryMetricCardGridComponent | Reused stat card layout. |
| Closed trades | Closed trades table | ClosedTradesTableComponent | Reusable table display. |
| Shared fallback | Coming soon / placeholder state | EmptyStateComponent | Useful for unfinished sections. |

---

## 3. Sections that should become shared components

These sections are strong candidates for shared Angular components because they appear in multiple contexts:

- Page hero / intro section
  - Use for public marketing pages and auth-facing panels.
- Summary metric card
  - Used on dashboard home, portfolio, chain, Greeks, probability, HV, IV, and closed trades.
- Card panel wrapper
  - Used throughout the app for content blocks, form panels, and data summaries.
- Section heading and eyebrow
  - Repeated across public pages and application modules.
- Data table wrapper
  - Used for portfolio, chain, HV, IV, alerts, closed trades, and EOD data.
- Form field / input wrapper
  - Used across login, register, contact, subscribe, trade, alert, and payoff forms.
- Primary / secondary / destructive action buttons
  - Repeated throughout the prototype with slightly different visual emphasis.
- Modal dialog shell
  - Shared by add-trade and exit-trade experiences.
- Chart card shell
  - Used for options chain, Greeks, probability, HV, IV, payoff, and EOD charts.

---

## 4. Repeated UI patterns

### Repeated card patterns

- Marketing feature cards
  - Used in services, about, tools, and home sections.
- Summary metric cards
  - Used across dashboard modules as compact KPI tiles.
- Content cards with title + description + optional action
  - Used in testimonials, platform overview, and feature blocks.
- Article or report cards
  - Used in the blog and reports experience.

### Repeated button patterns

- Primary CTA buttons
  - Green filled buttons for main actions like login, create account, subscribe, add leg, create alert.
- Secondary outline buttons
  - Used for navigation and less prominent actions.
- Icon buttons
  - Used for menu, close, and compact action controls.
- Destructive action buttons
  - Used for delete/exit/remove flows.

### Repeated form patterns

- Login / registration / contact forms
  - Label + input + validation message + primary action.
- OTP verification form
  - Input field + helper text + confirmation button.
- Subscribe form
  - Email input + single action button.
- Add trade / add alert / add leg forms
  - Selector + numeric fields + submit button.

### Repeated layout patterns

- Split hero layout
  - Text content on one side, supporting visual panel or card on the other.
- Two-column content layout
  - Main content + sticky supporting panel.
- Grid-based card layout
  - 2-column, 3-column, 4-column, and 5-column arrangements used throughout.
- Data-first layout
  - Summary cards followed by a table or chart section.
- Form + insights layout
  - A form on one side and a results panel on the other.

---

## 5. Recommended implementation grouping for future Angular work

A practical next-step grouping would be:

1. Shared UI primitives
   - Buttons, cards, inputs, tables, modals, section headers, empty states.
2. Public experience
   - Public shell, hero, about, services, tools, contact, blog, and preview sections.
3. Auth experience
   - Auth layout, login/register/OTP components.
4. Dashboard shell
   - Sidebar, top bar, ticker, command palette, and layout container.
5. Analytics modules
   - Portfolio, options chain, Greeks, probability, HV, IV, payoff, EOD, alerts, and closed trades.

This structure keeps the prototype modular and makes it easier to convert into standalone Angular components without collapsing the entire page into one large view.
