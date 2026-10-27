# Shared pricing: where each screen gets its inputs

Status 2026-10-27: the migration is done. Every screen prices through `src/app/shared/pricing/`; no HV-20 estimate or 10 % default remains in a pricing path.

| Input | Source |
|---|---|
| Instrument type | `InstrumentKindService` → `GET /fo/dd_list_v2` (cached) |
| Index underlying | `dd_symbol_details.underlying` (spot index value) |
| Stock underlying | `FuturesCloseService` → `POST /fo/xx_close` for the option's own expiry |
| Rate / dividend | `MARKET_PARAMS` by instrument type (index 5.5 % / 1 %; stock 0.01 % / 0 %) |
| Option price | the contract's own EOD close (`/tools/options-chain` `c_ltp` / `p_ltp`) |
| Days to expiry | `daysToExpiry` from today's IST date; 0 on expiry day (no IV, intrinsic value) |
| Resolver | `PricingContextService.resolve(symbol, expiry, spot)` → context or a failure reason |

| Screen | What it does |
|---|---|
| Options Chain | per strike and per side `contractGreeks` (IV from the contract's close, Greeks at that IV); shows the IV underlying and its basis |
| Greeks | EOD: call and put each at their own solved IV; Custom: typed volatility with an Index/Stock choice for the approved rate and dividend |
| Implied Volatility | solves from the selected strike's close with the context's underlying, rate and dividend |
| Probability | shared frontend calculation; EOD volatility = at-the-money implied volatility (`atmImpliedVolatility`) of the first expiry; zero-drift convention unchanged |
| Payoff | each leg's IV solved from its own premium (`solveIvInContext`); the IV slider multiplies those IVs; expiry-day legs are intrinsic; stock legs use their own expiry's futures close |

Rules that hold everywhere: no fallback to spot, to another expiry's futures, to LTP, or to HV-20; a missing input gives no number and a stated reason.
Custom mode needs a volatility only to create a model premium: it starts from the loaded instrument's solved IV, never from HV-20.
