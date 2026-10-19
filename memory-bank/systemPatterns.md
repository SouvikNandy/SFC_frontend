# System patterns

- **Layout**: `core/` (auth, ApiService, interceptor, guards, storage, toast), `shared/` (design-system components, DataTable, ticker service, date-range utils), `features/{public,auth,dashboard}`, `layouts/`. Each dashboard screen has a component, a service and a model.
- **Data flow**: component -> feature service -> `ApiService` -> backend. Shared reference data (`/fo/dd_list`, `/fo/dd_symbol_details`) comes from `GreeksCalculatorService`; `/fo/dd_list` is cached for the session.
- **Patterns to follow**: standalone + OnPush; `switchMap` (or unsubscribe the previous subscription) so only the newest request updates a screen; handle errors with a toast plus inline message and always clear loading flags; a failed shared request must not be cached. Newer screens (Multi-Leg, Payoff, Portfolio) use `inject`, signals and `takeUntilDestroyed`; use that style for new code.
- **Patterns to avoid**: logging tokens, responses or personal data; calling HttpClient from components; fabricating prices; showing mock data as live.
- **Testing style**: vitest with `HttpTestingController` for services and stubbed services (Subjects for in-flight control) for components.
