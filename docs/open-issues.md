# Open issues: PO decisions and backend limitations

Audience: PO, backend developers and the frontend team. Status 2026-11-03. Nothing below is fixed in the frontend; each item
needs the named owner. The frontend does not work around backend limitations: where data is missing it shows no number and
says why.

## Decided (for reference)
| Decision | By | Where |
|---|---|---|
| EOD days to expiry count from the last BhavCopy trade date (`dd_symbol_details.trade_date`), not today. Supersedes Developer Change List item 2 (24 Oct, "count from today's date in IST"). Custom and Live keep today's IST date. | Raja, 2026-11-03 | `shared/utils/expiry.ts` (`eodValuationDate`), commit 08ea235 |
| No expiry selectors are added to Greeks or Probability; their expiry behaviour stays as it is. | Raja, 2026-11-03 | unchanged |

## Confirmed frontend bugs
None open. Fixed on 2026-11-03 (regression tests in `symbol-switch-stale-state.spec.ts`, browser-verified against the live API):
Greeks strike dropdown showing the first listed strike instead of the strike used; Greeks keeping the previous symbol's
badge and strikes after a failed load; Probability and Implied Volatility applying a late answer for the previous symbol
(and IV keeping its expiries/strikes after a failed load); Options Chain loading forever after failed symbol details;
blank Tabler icons (dead CDN path). Earlier: Greeks blank after Custom/Live -> EOD (commit 08ea235).

## PO decisions needed
| # | Question | Screens | Current behaviour |
|---|---|---|---|
| PO-1 | Written sign-off that Raja's trade-date rule supersedes Change List item 2 (the client document still says "do not count from the EOD data date"). | All EOD tools | Trade date is used |
| PO-2 | Should the EOD day count stay editable on Greeks and Probability? A typed value is combined with the first expiry's Close (EOD) prices (Greeks) or ATM implied volatility (Probability), so the result belongs to no listed contract. | Greeks, Probability | Editable (existing behaviour kept) |
| PO-3 | Payoff Custom mode with a symbol loaded shows that symbol's BhavCopy trade date as its valuation date (today only before any symbol loads). Confirm. | Payoff | Trade date (interim choice made during development, 2026-11-03; needs PO confirmation) |
| PO-4 | Expiry day and lapsed expiries: when the trade date equals the expiry the contract has 0 days (no IV, intrinsic value); an expiry between the trade date and today may no longer be listed. Confirm both. | All EOD tools | As described |
| PO-5 | Live mode day count: whole calendar days, or a fraction of a day to the 15:30 close, once a live feed exists. | Live tabs | Not applicable yet (no live feed) |

## Backend limitations
| # | Limitation | Effect in the frontend | Needed |
|---|---|---|---|
| BE-1 | `POST /tools/options-chain` returns no trade date. | The chain prices cannot be shown to belong to the same session as `dd_symbol_details.trade_date`. | Add `trade_date` to the response. |
| BE-2 | `POST /fo/xx_close` `trade_date` is not checked against `dd_symbol_details.trade_date`. | A partial overnight load could mix sessions for stock options without a warning. | Confirm all three endpoints switch session together, or expose the session so the frontend can reject a mismatch. |
| BE-3 | `dd_symbol_details` lists upcoming expiries only (as of today) and has no as-of date. | Expired expiries cannot be offered; an expiry between the trade date and today may vanish (PO-4). | Expiry history or an `as_of` / `include_expired` option. |
| BE-4 | `POST /fo/dd_strikes` has no as-of date. | Historical strike lists are approximated (see `multi-leg-eod-expiry-strikes.md`). | `trade_date` filter. |
| BE-5 | `/fo/eod` and `/fo/eod/chart` futures (`XX`) ignore `expiry` and rows carry no expiry. | A specific futures expiry cannot be selected or proven. | Honour `expiry` or return it per row. |
| BE-6 | Portfolio API returns `cmp: null`. | CMP falls back to the latest EOD close, labelled as such. | Populate `cmp` / `unrealised`. |
| BE-7 | Option `/fo/eod` requests without strike/expiry answer HTTP 500. | The UI always sends both. | Return 422 with a message. |

## Potential issues and cleanup (not confirmed bugs; deliberately not changed)
- IV expiry dropdown binds `[value]` like the fixed Greeks strike dropdown; it cannot mismatch today (the selected value is always the first option when the list is rebuilt). Revisit if that changes.
- Angular development-mode console warnings: "disabled attribute with a reactive form directive" (Greeks, IV, Probability) and NG0956 (IV). No functional effect observed.
- Component style budget warnings in `ng build`; no ESLint configuration.
- HTTP 301/404 rules need the deployment owner (`deployment-routing.md`).
