# Active context

**Current focus** (one short paragraph):

Historical Volatility, Greeks, Implied Volatility, Probability, and the authentication lifecycle are connected to their production flows while preserving the approved UI and architecture.

**In progress**:

- [x] Integrate typed DD Greeks metadata into the shared EOD component.
- [x] Add and adopt the generic DataTable for EOD and Portfolio.
- [x] Replace the Historical Volatility placeholder with the approved interactive calculator.
- [x] Replace Historical Volatility mock data with `/fo/dd_list` autocomplete and `/tools/hv` results.
- [x] Replace Greeks mock metadata with `/fo/dd_list` autocomplete and `/fo/dd_symbol_details` details.
- [x] Replace Implied Volatility placeholder with API-backed EOD/custom/live modes, IV solver, chart, and calculation trace.
- [x] Replace Probability placeholder with API-backed EOD/custom/live modes, results, chart, validation, and supporting DataTable.
- [x] Complete authentication guards, registration context, login/session handling, logout cleanup, refresh coordination, password APIs, and temporary OTP flow.

**Decisions (recent)**:

- Public `/data` and dashboard `/dashboard/eod` both lazy-load the same `EodComponent`.
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
- Authentication uses `sessionStorage` for non-sensitive registration context only; passwords are never persisted.
- OTP is intentionally local and accepts only `DEFAULT_OTP = '0000'` until the backend verification contract is confirmed.

_Update when the task or branch focus changes._
