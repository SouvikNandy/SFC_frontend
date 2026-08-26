# Active context

**Current focus** (one short paragraph):

Historical Volatility is implemented from the approved prototype using the existing dashboard theme and reusable DataTable.

**In progress**:

- [x] Integrate typed DD Greeks metadata into the shared EOD component.
- [x] Add and adopt the generic DataTable for EOD and Portfolio.
- [x] Replace the Historical Volatility placeholder with the approved interactive calculator.

**Decisions (recent)**:

- Public `/data` and dashboard `/dashboard/eod` both lazy-load the same `EodComponent`.
- DD Greeks metadata is loaded on symbol changes; EOD reloads on instrument, strike, expiry, and date-range changes.
- DataTable owns presentation, formatting, state, and emitted interactions; feature components retain API and business logic.

**Open questions**:

- The frontend repository contains no backend contract documentation beyond the selected-symbol request requirement.
- Options Chain remains specialized because its grouped headers and conditional Greek columns do not fit the simple DataTable without visual regression.
- Historical Volatility uses typed deterministic mock data and isolated calculation service until a real API contract is provided.

_Update when the task or branch focus changes._
