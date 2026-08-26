# Progress

**What works**

- Typed `DdGreeksData`, request, and response models are defined.
- `EodService` calls `/fo/dd_greeks` and `/fo/eod` through the existing `ApiService` and interceptor.
- Public and dashboard routes reuse one EOD component; metadata-driven expiry, strikes, ATM selection, and request race cancellation are implemented.
- `npm run build` passes.
- Generic typed `DataTableComponent` supports formatting, loading/empty states, optional selection, row clicks, actions, sticky headers, and responsive scrolling.
- EOD and Portfolio use the reusable table; Options Chain remains specialized to preserve its grouped visual design.
- Historical Volatility now includes source tabs, instrument selection, as-of dates, HV-10/HV-20 calculations, dynamic SVG chart, premium lock state, validation, and a typed DataTable.

**Not started / backlog**

- Add focused EOD service/component tests when the test matcher setup is repaired.
- Consider a projected-cell extension only if a future grouped table needs migration without visual changes.
- Replace the Historical Volatility mock service with a real API implementation when the backend contract is available.

**Known issues**

- `npm test -- --watch=false` is blocked by the existing `toBeTrue()` matcher error in `login.component.spec.ts`.

_Keep bullets factual and small; link issues or PRs when useful._
