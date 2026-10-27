# Backend contracts used by the pricing screens

Audience: backend developers. Status 2026-10-27. Everything below was checked against the live read-only API (`/api/v1`).

## In use (confirmed by the backend, verified live)
| API | Used for | Verified |
|---|---|---|
| `GET /fo/dd_list_v2` | `data` maps every symbol to `"INDEX"` or `"STOCK"`; the app never infers the type from a symbol name. The original `/fo/dd_list` is unchanged and still supplies the symbol lists. | `NIFTY: INDEX`, `RELIANCE: STOCK`, ... |
| `POST /fo/dd_symbol_details` `{symbol}` | `underlying` = the **spot index value** for index options; expiries; strikes; ATM strike | NIFTY 22600 (23 Oct), 22753.2 (26 Oct) |
| `POST /fo/xx_close` `{symbol, expiry}` | `data: {trade_date, close}`, the futures close of that **same expiry**; the stock options' underlying | RELIANCE 27 Oct = 1200.5, 23 Nov = 1207.0 |
| `POST /tools/options-chain` `{symbol, expiry}` | per strike `c_ltp` / `p_ltp` = the contract's **EOD close** (equal to the `/fo/eod` row `close`), the option price IV is solved from | NIFTY 22600 CE 124.4, RELIANCE 1190 CE 8.3 |
| `POST /fo/ticker` | `price`, `change`, `positive`, `latest_date`; shown as returned | NIFTY 22753.2, +153.2 on 26 Oct (prior close 22600.0, 23 Oct) |

Approved market inputs applied by the frontend: index risk-free 5.5 % / dividend 1 %; stock risk-free 0.01 % / dividend 0 %.
Index underlying = spot index value (`dd_symbol_details.underlying`). Stock underlying = the `fo/xx_close` close for the option's own expiry.
If a price or the instrument type is missing the screens show **no IV** and say why; they never substitute spot or another expiry's futures.

## Remaining backend notes
1. **`/fo/xx_close` answers HTTP 500 for an expiry that has no futures contract** (seen for RELIANCE `2026-11-24`). The app treats any
   error or missing close as "no futures close for this expiry". A 4xx or an empty `data` would be cleaner.
2. **Settlement price:** `Close (EOD)` is the EOD row `close`; `LTP` is the EOD row `ltp` (also `market_price.CE/PE`). "Settle Price (EOD)" is not
   used anywhere because no field has been verified to be the settlement price. If it is wanted, provide a documented settlement field.
3. **`/tools/probability`** ignores the volatility it is sent (it always uses the symbol's HV-20, rate 0, dividend 0), so the Probability screen
   no longer calls it; it uses the shared frontend calculation with the at-the-money implied volatility. No backend change is required.
4. **Disclaimer acceptance** is enforced in the browser only; nothing is sent to the backend. Say if it must be recorded.
5. `latest_date` on `/fo/ticker` is the session the figures belong to; the Home cards show it as "as of DD Mon YYYY".
