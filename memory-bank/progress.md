# Progress

**What works**

- Typed `DdGreeksData`, request, and response models are defined.
- `EodService` calls `/fo/dd_symbol_details` and `/fo/eod` through the existing `ApiService` and interceptor.
- Public and dashboard routes reuse one EOD component; metadata-driven expiry, strikes, ATM selection, and request race cancellation are implemented.
- `npm run build` passes.
- Generic typed `DataTableComponent` supports formatting, loading/empty states, optional selection, row clicks, actions, sticky headers, and responsive scrolling.
- EOD and Portfolio use the reusable table; Options Chain remains specialized to preserve its grouped visual design.
- Historical Volatility now includes source tabs, API-backed symbol autocomplete, date-safe form submission, HV-10/HV-20 result cards, dynamic SVG chart, premium lock state, validation, and a typed DataTable.
- Greeks now uses the real symbol list and symbol-details APIs with local autocomplete, typed metadata, ATM strike selection, and stale-request protection.
- Implied Volatility now has API-backed symbol autocomplete/details, Custom/EOD/Live modes, Auto/Manual market price, prototype-equivalent IV solving, dynamic chart, and calculation trace.
- Probability now has API-backed symbol autocomplete/details, Custom/EOD/Live modes, debounced calculation, authoritative result cards, dynamic terminal distribution chart, validation, and a reusable DataTable for supporting calculations.
- Payoff Tool implemented: EOD/Custom/Live modes, symbol autocomplete, 16 strategy presets, editable legs in DataTable, single calculation engine feeding strike ladder, summary strip, SVG graph with hover tooltip, and heat-map table; validation, loading/error/empty states, and switchMap stale-request protection.
- Authentication now enforces dashboard/guest/registration guards, preserves registration context, uses real login/register/forgot/reset/logout/refresh endpoints, coordinates concurrent refreshes, and centralizes temporary OTP handling.

- Public dashboard + authenticated Live Data section across Options Chain, Greeks, Probability, HV, IV and Payoff; login returnUrl; logout stays on dashboard.

- Client feedback C1/C2/C6/C7 done (EOD Close + CSV filename, stacked OI charts with ATM line, Payoff inactive tab tint); build passes, UI checked in headless Chrome with mocked API.

- Payoff per-leg IV refactor done (payoff-pricing.ts, payoff-engine.spec.ts, payoff.component.spec.ts); `ng test` now compiles (login spec matcher fixed); only stale app.spec.ts fails.

- Portfolio Analysis and Multi-Leg EOD Data screens implemented (portfolio-ledger.ts, portfolio-store.service.ts, portfolio-market.service.ts, multi-leg-eod/*) with specs; 141/142 tests pass (stale app.spec only).

- Portfolio Analysis integrated with the live Portfolio API (all 9 endpoints); specs: portfolio-api.service.spec.ts, portfolio.component.spec.ts.

**Not started / backlog**

- Backend: `cmp` not populated yet (unrealised stays null); verify the integration against the real backend (only mocked responses were exercised).

- Backend: portfolio persistence endpoint (ledger is browser-local today); confirm /fo/eod futures contract/expiry selection and expired-contract history.


- C3 Home landing page: pending client decision (keep vs remove); if kept, remove the INDEPENDENT MARKETS CONSULTING tag and the stats strip.
- Backend: confirm `/fo/eod` returns `close` for CE/PE rows (no LTP fallback is used).
- Client: confirm futures CSV filename `SYMBOL_FUT.csv`.

- Live market feed (REST/WebSocket) — no backend contract yet; plug into `LiveDataService`.
- Subscription layer (out of scope) — extend `LiveDataAccess` in `LiveDataAccessService`.
- Tabler icon CDN link in `src/index.html` returns 404, so all `ti ti-*` icons are blank app-wide (pre-existing).

- Add focused EOD service/component tests when the test matcher setup is repaired.
- Consider a projected-cell extension only if a future grouped table needs migration without visual changes.
- Add focused Historical Volatility service/component tests when the test matcher setup is repaired.
- Add focused Greeks service/component tests when the test matcher setup is repaired.
- Add focused Implied Volatility solver/component tests when the test matcher setup is repaired.
- Add focused Probability service/component tests when the test matcher setup is repaired.
- Payoff: confirm with backend whether options-chain `c_ltp/p_ltp` are BhavCopy settlement or close prices (UI labels them "BhavCopy settle"); decide whether `/tools/payoff` should be fixed or retired; add engine unit tests when test matcher setup is repaired.
- Add focused authentication service/guard/interceptor tests when the test matcher setup is repaired.

**Known issues**

- None blocking. `npm run build` passes with 10 `anyComponentStyle` budget warnings (4 kB warning; error budget is 16 kB). `ng test` runs clean (the test matcher problem is fixed); jsdom prints "Window's scrollTo() not implemented" noise.
- No ESLint config or lint script exists.

_Keep bullets factual and small; link issues or PRs when useful._

- 2026-10-18: Re-verified against the live API. Portfolio UI: 25/25 checks (fills, square-off, closed pagination/sort/grouping, performance, baskets). Multi-Leg EOD: real /fo/eod, charts, tables, per-leg requests and CSV filenames OK. 171/171 unit tests pass.

## Backend blockers / unverified (2026-10-18)
- Multi-Leg expired contracts: `/fo/eod` returns data for expired contracts when expiry+strike are supplied (verified: NIFTY CE 24000, 2026-09-29), but no API lists expired expiries. `/fo/dd_symbol_details` returns upcoming expiries only and ignores `trade_date`/`date`/`as_of`/`include_expired`/`expired`; `/fo/dd_list` is GET and lists symbols only. Needs backend: either a documented expiry-history endpoint (e.g. symbol + date range -> expiry dates, incl. expired) or an `include_expired`/`as_of` option on `dd_symbol_details`. Expiries are NOT derived client-side (holiday-shifted weeklies make that unreliable). Expiry dropdown unchanged.
- Portfolio: backend still returns `cmp: null`. The UI now falls back to the latest `/fo/eod` close (see "EOD close as CMP" below). Backend-populated `cmp`/`unrealised` is still unverified live; when present it always wins (code path covered by unit tests only).
- Payoff Custom mode: no manual vol input by decision; reference vol stays HV-20 x multiplier. Calculation unchanged.

## EOD close as CMP (2026-10-18)
- Files: `portfolio-eod-price.ts` (pure logic), `portfolio-eod-price.service.ts` (`/fo/eod` lookups, 10-min cache, 4 parallel), wiring in `portfolio.component.ts` (`eodQuotes`, `openRows`, `basketsView`, `summaryView`, `cmpNote`).
- Applies only to rows where the API gave neither `cmp` nor `unrealised`. Never overwrites backend values. Rows get `cmp_source:'eod'`, `cmp_date`; UI caption "EOD close - 16 Oct" and a footnote "not live prices".
- Options: exact symbol + CE/PE + strike + expiry; request window = last 10 days, page_size 20; latest bar that is NOT a no-trade bar (zero OHLC/volume, stale carried close), close > 0. Nothing in window -> stays unpriced.
- Unrealised = (cmp - avg_cost) x lots x lot_size, negated for SHORT (Portfolio API formula). FUT notional re-based to cmp x units (API rule); option notional unchanged. KPI summary/bucket totals adjusted only from a baskets response newer than the last mutation (`basketsFresh`).
- Futures: `/fo/eod` XX ignores `expiry` and rows have no expiry field (verified: identical series for 5 different expiry values). Backend says it serves the nearest expiry. A FUT position is priced only if its expiry == the nearest MONTHLY expiry on the bar date (monthly = last listed expiry of its calendar month in `dd_symbol_details`). Weekly/later-month FUT stay "not priced". UNRESOLVED: the nearest-expiry behaviour is not provable from the response (no expiry field); a roll-day mismatch is possible. Needs backend to return the contract expiry on futures rows (or honour `expiry`).
- Live broker data later: use live price first, keep this as fallback (the overlay already yields to any non-null backend value).

## One-year custom date range (2026-10-18)
- Only F&O EOD and Multi-Leg EOD (Portfolio Performance, Historical Volatility untouched by decision). Shared rules in `src/app/shared/utils/date-range.ts`: inclusive one calendar year (From 18 Oct 2025 -> To 18 Oct 2026 ok; 17 Oct fails), 29 Feb + 1y = 28 Feb, picker limits `fromPickerMin` / `tillPickerMax`, `localTodayIso()`.
- F&O EOD: fixed `todayStr` (was `toISOString()` of local midnight = yesterday in IST). Invalid range -> no request, previous rows stay. Multi-Leg: `resolveRange` returns the error; an invalid range already clears the legs' rows (existing behaviour, unchanged).

## Technical-debt cleanup (2026-10-19)
- Baseline before: build passes, 232/232 tests. After: build passes (same 10 budget warnings), 256/256 tests (24 added).
- Removed console logging of tokens, login responses, user email and contact/subscribe PII (auth.service, auth.guard, login, blog, contact). Auth control flow, OTP (`0000`), registration/session persistence, guards, refresh and JWT storage are unchanged.
- Options Chain `loadChain()`: cancels the superseded request, sets loading, handles errors (toast + inline message, spinner cleared); a symbol change cancels a pending chain request and clears the error.
- `TickerService` uses `ApiService`; a failed or unsuccessful `/fo/ticker` response emits [] but is not cached (next caller retries); a success is shared and reused.
- `GreeksCalculatorService.getSymbols()` caches `/fo/dd_list` for the session (failures not cached, each caller gets its own array); `HistoricalVolatilityService.getSymbols()` delegates to it, so HV now also rejects `success:false` like the other screens.
- F&O EOD: `displayRows` is built once per `rows` change (`setRows`); `Intl.NumberFormat` instances hoisted. Output, paging, chart, CSV and API calls unchanged.
- `dist1810.zip` (zipped `ng build` output) untracked and ignored via `/dist*.zip`; the local file is kept.
- New specs: auth.service, options-chain.component, ticker.service, greeks-calculator.service (symbol list), eod.component.table.
- Deferred (post live-data): shared autocomplete extraction, erf/normCdf + chainIV + resolveExpiryDays de-duplication, Options Chain template/getter restructuring, `as any` in auth.service (add tests first), signal/`inject` migration of older screens, ESLint, auth design points (interceptor redirect on public pages, localStorage JWT, hard-coded OTP).

## Client change list 2026-10-24 (items 5, 6, 7)
- `/` renders the dashboard Home directly (one dashboard layout serves `/` and `/dashboard/*`; `/dashboard` and `/dashboard/home` redirect to `/`); public Home/About/Services/Blog/Contact/FAQ/Data pages deleted and their paths (plus `/home`) redirect to `/`; orphaned assets/svg removed; `/termsconditions` redirects to `/terms-conditions`; unknown URLs render NotFound in place (links now point to tools).
- HTTP 301/404 are NOT done: no hosting config in the repo; see docs/deployment-routing.md for the server rules.
- Disclaimer: client wording in `shared/legal/disclaimer.ts`; `app-footer` in the public, dashboard and auth layouts; `/disclaimer` page; required checkbox on Register (frontend only, nothing sent to the backend).
- Price Alerts and Blog & Reports removed from sidebar, topbar labels and Home quick links; their URLs redirect to `/`.
- "Live" wording removed from the auth shell, Home overview and index.html meta. Tool "Live data - Premium" tabs remain (scope question).

## Shared pricing migration (2026-10-27)
- `shared/pricing/`: option-pricing (BSM, Greeks, IV solver, MARKET_PARAMS), contract-iv, contract-greeks, atm-iv, instrument-kind.service (GET /fo/dd_list_v2), futures-close.service (POST /fo/xx_close), pricing-context.service. Chain, Greeks, IV, Probability (ATM IV, zero drift kept) and Payoff (chainIV removed; leg IV solved from its own premium) all use it; index underlying = dd_symbol_details.underlying, stock = same-expiry futures close; no fallbacks.
- Option price for IV = EOD close (chain c_ltp/p_ltp). Labels: Close (EOD) / LTP; no Settle Price label (no verified field). Ticker shows latest_date.
- Browser-checked in headless Chrome against the live API (CDP scripts, not committed). 301/404 still need server config (docs/deployment-routing.md).

- Tool URLs moved to the top level (2026-10-27): `/greeks`, `/payoff`, `/portfolio`, `/options-chain`, `/eod`, `/multi-leg-eod`, `/probability`, `/historical-volatility`, `/implied-volatility`; `/dashboard/<tool>` (and `/dashboard/closed-trades`) redirect with the query string kept, `/dashboard` and `/dashboard/home` go to `/`. `/termsconditions` now renders the Terms page (HTTP 200). Topbar title reads the first URL segment. See docs/deployment-routing.md for the server rules.
