# Multi-Leg EOD: default expiry, ATM and strike lists

Technical notes for the Multi-Leg EOD screen (`src/app/features/dashboard/multi-leg-eod`). Scope: how the default expiry and ATM strike are
chosen, what each backend call can and cannot tell us, and the known limitation of the strike data.

## Expiry list and selection (all modes: 1W, 1M, 3M, Custom)
- The dropdown offers **only the verified list** for the active dates: the expiries `POST /fo/dd_expiry` returns for the resolved From and To
  (the presets ask for a window wider than the sessions shown: 1W from today - 15 days, 1M - 41, 3M - 108; the backend also returns later
  expiries, out to the far future) together with the upcoming expiries from `POST /fo/dd_symbol_details`; never one before From. An expiry
  that is not listed is never added back as an option.
- Every time a list for the current dates arrives each leg is reconciled (`reconcileLegExpiry` in `multi-leg-eod.util.ts`):
  1. a **hand-picked** expiry that is still listed is kept;
  2. any other leg (untouched, or a pick that is no longer listed) takes the **nearest listed expiry on or after the selected To date**
     (never the system date; the To date itself counts). With no expiry inside the dates this is the next one on or after From;
  3. with none on or after To, the **latest listed expiry within From..To**;
  4. with no valid expiry at all the leg's expiry and strike are cleared, nothing is requested and the screen shows the empty state.
  A replaced pick follows the default from then on and the user is told by an info toast; the in-range fallback for untouched legs is
  routine and silent (see notification-guidelines.md).
- The date range, the preset and the From/To dates are never changed by this. (Custom keeps its own date validation: a From or To that no
  longer fits the other date is cleared, as before.)
- **API failure:** the legs keep their selections, the error offers Retry, the expiry dropdowns and Add leg are disabled, nothing is reconciled
  against the upcoming-only standard list and no leg data is requested until a list for the dates arrives. `422 "No data available."` is an
  empty (verified) range, not a failure. While the list is unverified the chart and tables say "Leg data loads once the expiry list for
  these dates is available." instead of the empty-data messages.
- **Invalid Custom dates:** the selections are kept, expiry selection is disabled, nothing is requested and the dates are not corrected.
- Answers for superseded dates or symbols are dropped (request key), so a late list never reconciles the legs.

## Strike of a leg
- A strike the user picked is kept while its expiry lists it. When the expiry's list is known and does not contain it (or the expiry lists no
  strikes) it is reset to that expiry's ATM, is no longer a pick, and an info toast says so; it is never shown as an extra option. A list that could not be loaded proves
  nothing: the pick is kept and flagged "(could not be checked for this expiry)".
- A leg is requested only once its expiry's strikes have answered, so leg data never uses a strike from another expiry. After a date change the
  reload waits for the expiry list, the To-date close and the strike lists of the legs.

## ATM strike
- ATM = the strike nearest the **underlying close of the To date** (the previous trading session when the To date is a weekend or holiday),
  taken from that expiry's own strike list. It is calculated per leg and never uses the current price or the expiry-date close.
- The close comes from `POST /fo/dd_symbol_details` with `trade_date` (the session is found through the symbol's futures series in
  `POST /fo/eod/chart`). The strike list comes from `POST /fo/dd_strikes` `{ symbol, expiry }`. The response key is spelled `stikes`.

## Sparse strike warning
- Far expiries list few strikes. When the calculated ATM is more than `SPARSE_ATM_THRESHOLD_PERCENT` (1) percent away from the close
  (`abs(atm - close) / close * 100`), the leg shows an inline note. The threshold is the named constant in `multi-leg-eod.util.ts`.
- The warning is informational: it changes neither the ATM nor any strike the user picked.

## Known limitation: historical strike availability cannot be verified
`POST /fo/dd_strikes` has **no as-of-date parameter** (a `trade_date` sent to it is ignored). It returns the strikes the backend holds for the
expiry, not the strikes that were listed on the selected To date. For a historical To date the nearest strike in that list may therefore be one
that was not yet listed that day, and the screen cannot tell. It does not invent availability: the leg then simply returns no rows and the
"no EOD bars" note applies. Fixing it needs a backend change (a `trade_date` filter on `dd_strikes`, or per-session strike lists).
