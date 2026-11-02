# Multi-Leg EOD: default expiry, ATM and strike lists

Technical notes for the Multi-Leg EOD screen (`src/app/features/dashboard/multi-leg-eod`). Scope: how the default expiry and ATM strike are
chosen, what each backend call can and cannot tell us, and the known limitation of the strike data.

## Default expiry
- Untouched legs take the **nearest listed expiry on or after the selected To date** (the To date of the range, never the system date).
  An expiry on the To date itself counts.
- Candidates are the expiries `POST /fo/dd_expiry` returns for the selected From and To (the backend also returns later ones, out to the far
  future) together with the upcoming expiries from `POST /fo/dd_symbol_details`.
- When no expiry is listed on or after the To date the legs keep their expiries and the screen says so (`forwardExpiryNote`).
- A leg whose expiry the user chose is never replaced by a default. A leg whose expiry is before the From date is not requested (the contract
  has no data in the range and the backend answers HTTP 422); a message explains it.

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
