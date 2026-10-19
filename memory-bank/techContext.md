# Tech context

**Stack**

- Language / runtime: TypeScript 5.9 (strict, strict templates), ES2022.
- Framework: Angular 21 standalone components, lazy-loaded routes, OnPush everywhere; RxJS 7.8. No state-management library.
- Package manager: npm 11.
- Major dependencies: @angular/{core,common,forms,router}; vitest + jsdom for tests. No charting or UI library (SVG charts are hand-built).

**Environment**

- API base: `environment.apiBaseUrl` (https://quantsfc.com/api/v1 in both environments). `webSocketUrl` is still a placeholder.
- No secrets in the repo; JWTs are kept in localStorage by StorageService.

**Build & test**

- Build: `npm run build` (production). Tests: `npx ng test --watch=false` (vitest, run separately from the build).
- Style budgets: warning 4 kB, error 16 kB per component stylesheet.

**Constraints**

- All HTTP goes through `ApiService` and the auth interceptor; components never call HttpClient.
- `/fo/eod` is capped at 500 rows per response (follow `has_next`); custom date ranges are limited to one year.
