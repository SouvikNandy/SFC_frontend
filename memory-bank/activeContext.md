# Active context

**Current focus** (one short paragraph):

Client feedback round (QuantSFC_Change_Instructions.pdf): C1 EOD Close, C2 EOD CSV filename, C6 Options Chain OI charts and C7 Payoff Table-tab tint are implemented and browser-verified with mocked API. C3 (Home landing page) is pending a client decision; C4 and C5 are out of scope.

**In progress**:

- [x] Integrate typed DD Greeks metadata into the shared EOD component.
- [x] Add and adopt the generic DataTable for EOD and Portfolio.
- [x] Replace the Historical Volatility placeholder with the approved interactive calculator.
- [x] Replace Historical Volatility mock data with `/fo/dd_list` autocomplete and `/tools/hv` results.
- [x] Replace Greeks mock metadata with `/fo/dd_list` autocomplete and `/fo/dd_symbol_details` details.
- [x] Replace Implied Volatility placeholder with API-backed EOD/custom/live modes, IV solver, chart, and calculation trace.
- [x] Replace Probability placeholder with API-backed EOD/custom/live modes, results, chart, validation, and supporting DataTable.
- [x] Replace Payoff placeholder with prototype-equivalent Payoff Tool (`/fo/dd_symbol_details` + per-expiry `/tools/options-chain` prices, 16 strategies, graph/heat-map table, strike ladder).
- [x] Complete authentication guards, registration context, login/session handling, logout cleanup, refresh coordination, password APIs, and temporary OTP flow.

**Decisions (recent)**:

- Portfolio Analysis + Multi-Leg EOD (2026-10-16): /dashboard/portfolio renamed Portfolio Analysis (paper ledger; no backend endpoint, so persisted in localStorage per user; CMP and basket history from real /fo/eod closes; Live is a locked Premium state). Closed Trades screen replaced by Multi-Leg EOD Data at /dashboard/multi-leg-eod (old /closed-trades redirects); per-leg data via EodService.getAllRows (/fo/eod paging), no synthetic prices.

- Payoff per-leg IV (2026-10-16): Base volatility field removed. Each leg IV = approved chainIV(spot, strike, HV-20 reference) in `payoff/payoff-pricing.ts`; IV slider is a multiplier on every leg; probability/CoP use nearest-expiry average leg IV x multiplier. Entry-premium calibration offset per leg fades linearly to 0 at expiry so T+0 P&L at entry spot = 0 and expiry = intrinsic. Date slider defaults to T+0. Custom mode takes reference vol from last loaded instrument HV-20 (assumption, needs PO confirmation). Prototype _13 itself solves IV from premium instead of chainIV; brief followed.

- Client feedback (2026-10-16): EOD uses backend `close` only (no LTP fallback; `ltp` optional/unused). CSV filename is `SYMBOL_EXPIRY_STRIKE_OPTIONTYPE.csv` (futures: `SYMBOL_FUT.csv`, missing parts omitted). Options Chain OI charts are stacked, 1000x400 viewBox, with an ATM line placed via the shared bar-x mapping (interpolated if ATM is not a listed strike). Payoff inactive view tab uses `--panel-alt`. C3 landing page untouched (pending); C4/C5 not implemented.

- Public `/data` and dashboard `/dashboard/eod` both lazy-load the same `EodComponent`. It searches all `/fo/dd_list` symbols (shared autocomplete pattern, default NIFTY); `dd_symbol_details.expiry_date` is now an array (older responses: string) and is normalised to sorted YYYY-MM-DD options, first expiry selected.
- DD Greeks metadata is loaded on symbol changes; EOD reloads on instrument, strike, expiry, and date-range changes.
- DataTable owns presentation, formatting, state, and emitted interactions; feature components retain API and business logic.

**Open questions**:

- The frontend repository contains no backend contract documentation beyond the selected-symbol request requirement.
- Options Chain remains specialized because its grouped headers and conditional Greek columns do not fit the simple DataTable without visual regression.
- Historical Volatility uses the confirmed response fields `trade_date`, `close_price`, `hv10`, `hv20`, and `daily_return` from `/tools/hv`.
- Symbol list responses are normalized in the feature service to support the confirmed `data` envelope and `SYMBOL_LIST` fallback.
- Greeks symbol-detail requests use POST `{ symbol }`; `switchMap` ensures stale symbol responses cannot overwrite the current selection.
- Greeks metadata maps underlying, API strikes, ATM strike, expiry days, HV20, and CE/PE market price into the existing form/calculation flow.
- Implied Volatility reuses the Greeks service for symbol APIs and keeps HV20 separate from the calculated IV result.
- Implied Volatility uses q=0, exact prototype Newton/bisection constants, API expiry-to-days conversion, and dynamic SVG chart data from the solver.
- Probability uses `POST /tools/probability` with `{ symbol, spot, target, expiry, iv }`; verified response values are under `data.results` and curve points under `data.charts.curve`.
- Probability reuses the Greeks symbol/details service integration and does not carry prototype synthetic instrument/history data into production.
- Payoff EOD premiums (2026-09-26, user decision): per-expiry prices from `POST /tools/options-chain {symbol, expiry}` (CE→c_ltp, PE→p_ltp), cached per expiry, re-quoted for every leg on type/strike/expiry change (prototype refreshPremiums). Presets + Add leg use the nearest listed expiry; two-expiry strategies use nearest + next listed expiry (user decision 2026-09-26, replaces prototype 16d/near+7d). `/tools/payoff` is no longer called: it ignores expiry and its PE values did not match any expiry chain. Spot/expiries/lot/HV20 still from `/fo/dd_symbol_details`. EOD refresh button intentionally absent (Custom keeps "Reprice at current vol"). Base volatility is editable in EOD (pre-filled from HV-20, reset on symbol load); it affects valuation/probability only, not BhavCopy premiums.
- Payoff math lives in `payoff/payoff-engine.ts` (`computePayoff`), verified numerically identical to `prototype/payoff-tool-pro_11.html`.
- DataTable gained optional `column.template` (cell `TemplateRef`) and `trackBy` input; both backward-compatible.
- Access model (2026-09-24): `/dashboard/**` is PUBLIC (no `authGuard`); only Live Data is restricted. Each screen's "Live data" tab renders `app-live-data-access` (`features/dashboard/live-data/`), which reads `LiveDataAccessService.access()` (derived from `AuthService.isAuthenticated`). Future subscription check belongs in that service. `LiveDataService.status` is 'unavailable' until a live API/WebSocket contract exists — never show mock data as live.
- Live Data is a separate view per screen: when the Live tab is active, NO EOD/Custom UI renders (feature-level `@if`/`*ngIf`, not CSS) and no symbol/EOD API runs; switching to Live cancels in-flight EOD requests, and EOD reloads when its tab reopens. `app-live-data-access` → `LiveDataLoginRequiredComponent` | `LiveDataUnavailableComponent`.
- Sign-in from Live Data goes to `/login?returnUrl=<page>?source=live`; screens reopen their Live tab when `source=live`. Logout keeps the user on the current dashboard page.
- Dashboard home Market summary: first 4 items of `POST /fo/ticker` (data[] of {symbol, price, change, positive}) via HomeService → TickerService; one shared request (shareReplay) for ticker tape + cards; change shown as points and % (prev close = price − change); unavailable message on failure.
- Authentication uses `sessionStorage` for non-sensitive registration context only; passwords are never persisted.
- OTP is intentionally local and accepts only `DEFAULT_OTP = '0000'` until the backend verification contract is confirmed.

_Update when the task or branch focus changes._
