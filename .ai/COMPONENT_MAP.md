# Component Map — QuantSFC Angular Architecture

This document is a documentation-only architecture map derived from the approved HTML prototype and the prototype analysis. It identifies the Angular components required for the conversion without generating any implementation code.

## 1. Layouts

| Component Name | Folder | Responsibility | Child Components | Inputs | Outputs | Reusable? |
| --- | --- | --- | --- | --- | --- | --- |
| PublicLayout | src/app/layouts/public-layout | Hosts the public-facing marketing experience, including the sticky header, page content, and footer. | PublicHeader, PublicFooter, PublicPageContainer | none | none | No |
| AuthLayout | src/app/layouts/auth-layout | Hosts the authentication experience with a branded left panel and the auth form area. | AuthHeroPanel, AuthFormSwitcher | none | none | No |
| DashboardLayout | src/app/layouts/dashboard-layout | Hosts the authenticated application shell with sidebar, top bar, ticker tape, and main content area. | SidebarNav, TopBar, TickerTape, CommandPalette | user, activeSection, isSidebarOpen | sectionChange, logout, toggleSidebar | No |

## 2. Shared Components

| Component Name | Folder | Responsibility | Child Components | Inputs | Outputs | Reusable? |
| --- | --- | --- | --- | --- | --- | --- |
| AppButton | src/app/shared/components/button | Renders the primary, secondary, pill, and icon button variants used across the product. | none | variant, label, disabled, icon | click | Yes |
| CardPanel | src/app/shared/components/card | Wraps content in the standard rounded panel style with border, spacing, and shadow. | none | title, subtitle, content, accent | none | Yes |
| StatTile | src/app/shared/components/stat-tile | Displays compact KPI values in a consistent card format. | none | label, value, tone | none | Yes |
| SectionEyebrow | src/app/shared/components/section-eyebrow | Displays the section label and accent bar used throughout the public and app views. | none | text | none | Yes |
| IconBadge | src/app/shared/components/icon-badge | Renders the circular icon chip used for feature cards, service cards, and badges. | none | icon, size, tone | none | Yes |
| FormField | src/app/shared/components/form-field | Provides a reusable input/label/error wrapper for forms. | none | label, control, type, placeholder, error | none | Yes |
| DataTable | src/app/shared/components/data-table | Renders responsive tables with headers, body rows, and action columns. | TableRow | columns, rows, stickyHeader | rowAction, sortChange | Yes |
| ModalDialog | src/app/shared/components/modal | Provides the shared overlay modal shell for trade management and other dialogs. | ModalHeader, ModalBody, ModalFooter | title, open, size | close, submit | Yes |
| Toast | src/app/shared/components/toast | Displays transient success/error feedback messages. | none | message, type, visible | dismissed | Yes |
| EmptyState | src/app/shared/components/empty-state | Displays a standard empty state when a list or table has no data. | none | title, description, actionLabel | action | Yes |
| PageHeader | src/app/shared/components/page-header | Renders the standard page title, description, and optional actions block. | none | title, subtitle, actions | none | Yes |
| ChartCard | src/app/shared/components/chart-card | Wraps a chart area with a heading and legend for analytics views. | none | title, legend, data | none | Yes |

## 3. Public Components

| Component Name | Folder | Responsibility | Child Components | Inputs | Outputs | Reusable? |
| --- | --- | --- | --- | --- | --- | --- |
| PublicHeader | src/app/features/public/components/public-header | Displays the public site header, navigation pills, logo, and login CTA. | PublicNav | currentPage | navigate | Yes |
| PublicFooter | src/app/features/public/components/public-footer | Displays the public footer and secondary navigation links. | none | none | none | Yes |
| PublicHero | src/app/features/public/components/public-hero | Renders the main marketing hero with headline, supporting text, CTA buttons, and market snapshot. | HeroStats, HeroMarketCard | eyebrow, title, subtitle, primaryAction, secondaryAction | primaryAction, secondaryAction | Yes |
| PublicAboutSection | src/app/features/public/components/public-about | Renders the About page content and the trust/experience story. | StatTile, IconBadge | content | none | No |
| PublicServicesSection | src/app/features/public/components/public-services | Renders the Services page and the consulting/training service cards. | ServiceCard | services | none | No |
| PublicToolsSection | src/app/features/public/components/public-tools | Renders the public tools overview and feature list for free vs locked tools. | ToolCard | tools | selectTool | No |
| PublicContactSection | src/app/features/public/components/public-contact | Renders the contact form and supporting contact information cards. | ContactForm, ContactInfoCard | none | submitContact | No |
| PublicBlogSection | src/app/features/public/components/public-blog | Renders the public blog/report listing and subscribe area. | BlogCard, SubscribeForm | posts | subscribe, downloadReport | No |
| PublicEodTeaserSection | src/app/features/public/components/public-eod | Renders the public EOD data teaser summary and call to action. | none | teaserCopy | navigateToAuth | No |
| PublicHomePage | src/app/features/public/components/public-home | Composes the full public home page from the marketing sections. | PublicHero, PublicAboutSection, PublicServicesSection, PublicToolsSection, PublicCTASection | none | navigateToAuth, navigateToData | No |
| PublicAboutPage | src/app/features/public/components/public-about-page | Hosts the full About experience. | PublicAboutSection | none | none | No |
| PublicServicesPage | src/app/features/public/components/public-services-page | Hosts the full Services experience. | PublicServicesSection | none | none | No |
| PublicBlogPage | src/app/features/public/components/public-blog-page | Hosts the full Blog and Reports experience. | PublicBlogSection | none | none | No |
| PublicContactPage | src/app/features/public/components/public-contact-page | Hosts the full Contact experience. | PublicContactSection | none | none | No |
| PublicEodPage | src/app/features/public/components/public-eod-page | Hosts the public EOD data experience. | PublicEodTeaserSection | none | none | No |
| PublicToolsPage | src/app/features/public/components/public-tools-page | Hosts the public tools overview page. | PublicToolsSection | none | none | No |

## 4. Dashboard Components

| Component Name | Folder | Responsibility | Child Components | Inputs | Outputs | Reusable? |
| --- | --- | --- | --- | --- | --- | --- |
| DashboardHomePage | src/app/features/dashboard/components/home | Renders the dashboard landing page with market summary, quick links, and overview content. | MarketSummaryGrid, QuickLinksGrid | userName, marketSnapshot | navigateSection | No |
| PortfolioPage | src/app/features/dashboard/components/portfolio | Renders portfolio summary, open positions table, and portfolio actions. | PortfolioSummaryGrid, PortfolioTable, AddTradeModal, ExitTradeModal | positions, totals | addTrade, exitTrade, closeTrade | No |
| PortfolioTable | src/app/features/dashboard/components/portfolio-table | Displays the portfolio positions in a responsive table. | DataTable | positions | openExitModal | Yes |
| AddTradeModal | src/app/features/dashboard/components/add-trade-modal | Collects trade details for creating a new portfolio position. | FormField, ModalDialog | open | submitTrade, close | Yes |
| ExitTradeModal | src/app/features/dashboard/components/exit-trade-modal | Captures the exit price and confirms closing a position. | FormField, ModalDialog | trade, open | submitExit, close | Yes |
| OptionsChainPage | src/app/features/dashboard/components/options-chain | Renders the options chain page including filters, summary cards, OI table, and charts. | SymbolSwitcher, ExpirySelector, OptionsChainTable, OiChart, IvSmileChart | chainData, symbol | selectSymbol, downloadCsv | No |
| OptionsChainTable | src/app/features/dashboard/components/options-chain-table | Displays the call/put option chain table with Greeks toggle support. | DataTable | rows, showGreeks | toggleGreeks | Yes |
| OiChart | src/app/features/dashboard/components/oi-chart | Renders the open interest bar chart for the options chain. | ChartCard | rows | none | Yes |
| IvSmileChart | src/app/features/dashboard/components/iv-smile-chart | Renders the implied volatility smile chart for the selected chain. | ChartCard | rows, selectedStrike | none | Yes |
| GreeksPage | src/app/features/dashboard/components/greeks | Renders the Greeks calculator UI and outputs. | GreeksForm, GreeksChart, GreeksSummaryTable | model | updateGreeksModel | No |
| GreeksForm | src/app/features/dashboard/components/greeks-form | Collects the inputs for the Black-Scholes Greeks calculator. | FormField | values | change | Yes |
| ProbabilityPage | src/app/features/dashboard/components/probability | Renders the probability calculator and distribution visualization. | ProbabilityForm, ProbabilityChart, ProbabilitySummaryTable | model | updateProbabilityModel | No |
| HistoricalVolatilityPage | src/app/features/dashboard/components/historical-volatility | Renders the historical volatility cards, chart, and rolling table. | HvChart, HvTable | series, hvStats | downloadCsv | No |
| HvChart | src/app/features/dashboard/components/hv-chart | Displays recent price data with rolling volatility context. | ChartCard | series | none | Yes |
| HvTable | src/app/features/dashboard/components/hv-table | Displays the historical volatility table for the selected symbol. | DataTable | rows | downloadCsv | Yes |
| ImpliedVolatilityPage | src/app/features/dashboard/components/implied-volatility | Renders the IV smile page with symbol/type/strike controls and strike table. | IvSelector, IvChart, IvTable | model, strikes | updateModel | No |
| PayoffSimulatorPage | src/app/features/dashboard/components/payoff-simulator | Renders the multi-leg payoff builder, chart, and leg table. | PayoffForm, PayoffChart, PayoffLegTable | legs | addLeg, removeLeg | No |
| PayoffForm | src/app/features/dashboard/components/payoff-form | Collects the leg details for the payoff simulator. | FormField | defaultValues | submitLeg | Yes |
| PayoffChart | src/app/features/dashboard/components/payoff-chart | Renders the expiry payoff curve and breakeven markers. | ChartCard | points, breakevens | none | Yes |
| EodDataPage | src/app/features/dashboard/components/eod-data | Renders the EOD data filter controls, chart, and data table. | EodFilterBar, EodChart, EodTable | dataset, filters | updateFilters, downloadCsv | No |
| BlogReportsPage | src/app/features/dashboard/components/blog-reports | Renders the blog/report cards and related actions. | BlogCard, SubscribeForm | posts | subscribe, downloadReport | No |
| BlogCard | src/app/features/dashboard/components/blog-card | Displays a single blog/report item with metadata and action button. | none | post | downloadReport | Yes |
| AlertsPage | src/app/features/dashboard/components/alerts | Renders the alerts form and active alerts list. | AlertForm, AlertTable | alerts | createAlert, deleteAlert | No |
| AlertForm | src/app/features/dashboard/components/alert-form | Captures the alert symbol, condition, and target price. | FormField | none | submitAlert | Yes |
| ClosedTradesPage | src/app/features/dashboard/components/closed-trades | Renders summary metrics and the closed trades history table. | ClosedTradesTable | trades, summary | none | No |
| SidebarNav | src/app/features/dashboard/components/sidebar-nav | Renders the dashboard sidebar navigation groups and active state. | NavGroup, NavItem | items, activeSection | selectSection | Yes |
| TopBar | src/app/features/dashboard/components/top-bar | Renders the dashboard header title, date label, and top actions. | none | title, dateLabel | openSidebar | Yes |
| TickerTape | src/app/features/dashboard/components/ticker-tape | Displays the moving market ticker strip. | TickerItem | items | none | Yes |
| CommandPalette | src/app/features/dashboard/components/command-palette | Displays the quick-jump overlay for navigation. | CommandInput, CommandResults | open, query, items | selectItem, close | Yes |

## 5. Authentication Components

| Component Name | Folder | Responsibility | Child Components | Inputs | Outputs | Reusable? |
| --- | --- | --- | --- | --- | --- | --- |
| AuthPage | src/app/features/auth/components/auth-page | Hosts the full authentication experience and switches between login, register, and OTP states. | AuthHeroPanel, AuthFormSwitcher, LoginForm, RegisterForm, OtpVerificationForm | authState | submitLogin, submitRegister, verifyOtp | No |
| AuthHeroPanel | src/app/features/auth/components/auth-hero-panel | Displays the branded left-side product message and feature highlights. | none | title, subtitle, highlights | none | Yes |
| AuthFormSwitcher | src/app/features/auth/components/auth-form-switcher | Handles the login/register tab toggle for the auth experience. | none | currentView | viewChange | Yes |
| LoginForm | src/app/features/auth/components/login-form | Renders the login form with validation, social login buttons, and password recovery. | FormField, SocialAuthActions | errors, loading | submitLogin, forgotPassword, switchToRegister | Yes |
| RegisterForm | src/app/features/auth/components/register-form | Renders the account creation form and inline validation states. | FormField | errors, loading | submitRegister | Yes |
| OtpVerificationForm | src/app/features/auth/components/otp-verification-form | Renders the OTP confirmation screen for email and phone verification. | FormField | loading, otpError | verifyOtp, resendOtp, goBack | Yes |
| SocialAuthActions | src/app/features/auth/components/social-auth-actions | Displays the social sign-in buttons used in the login screen. | none | none | selectSocialProvider | Yes |
