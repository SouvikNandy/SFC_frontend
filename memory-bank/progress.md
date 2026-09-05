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
- Authentication now enforces dashboard/guest/registration guards, preserves registration context, uses real login/register/forgot/reset/logout/refresh endpoints, coordinates concurrent refreshes, and centralizes temporary OTP handling.

**Not started / backlog**

- Add focused EOD service/component tests when the test matcher setup is repaired.
- Consider a projected-cell extension only if a future grouped table needs migration without visual changes.
- Add focused Historical Volatility service/component tests when the test matcher setup is repaired.
- Add focused Greeks service/component tests when the test matcher setup is repaired.
- Add focused Implied Volatility solver/component tests when the test matcher setup is repaired.
- Add focused Probability service/component tests when the test matcher setup is repaired.
- Add focused authentication service/guard/interceptor tests when the test matcher setup is repaired.

**Known issues**

- `npm test -- --watch=false` is blocked by the existing `toBeTrue()` matcher error in `login.component.spec.ts`.
- `npm run build` passes; existing Angular warnings remain, including the Historical Volatility stylesheet budget warning.

_Keep bullets factual and small; link issues or PRs when useful._
