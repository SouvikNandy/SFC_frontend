/*
 * Implied volatility of one option contract from its EOD close, using the approved market inputs.
 *
 * Rules (client-approved):
 *  - the option price is the EOD `close`;
 *  - an INDEX option uses the spot index value as the underlying, never a futures price;
 *  - a STOCK option uses the stock-futures price for the SAME expiry, never spot and never another expiry's futures;
 *  - rate and dividend come from the instrument type (see MARKET_PARAMS).
 *
 * When any required input is missing or does not match, the result says which one. Nothing is substituted and no
 * volatility is invented. `PricingContextService` supplies the instrument type (`/fo/dd_list_v2`) and the
 * matching-expiry futures close (`/fo/xx_close`); the screens then solve through `solveIvInContext`.
 */
import { InstrumentKind, OptionSide, bsPrice, marketParams, priceBounds, solveImpliedVolatility } from './option-pricing';

export type ContractIvFailure =
    | 'missing-instrument-type'
    | 'missing-spot-price'
    | 'missing-futures-price'
    | 'futures-expiry-mismatch'
    | 'missing-close-price'
    | 'no-time-to-expiry'
    | 'invalid-strike'
    | 'price-outside-bounds';

/** A futures price together with the expiry of the futures contract it belongs to (YYYY-MM-DD). */
export interface FuturesQuote {
    expiry: string;
    price: number;
    /** Session the close belongs to (from `/fo/xx_close`), when known. */
    tradeDate?: string;
}

export type UnderlyingResolution =
    | { ok: true; kind: InstrumentKind; underlying: number }
    | { ok: false; reason: 'missing-instrument-type' | 'missing-spot-price' | 'missing-futures-price' | 'futures-expiry-mismatch' };

const positive = (value: number | null | undefined): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;

/** The futures quote for exactly this expiry, or null. Another expiry's price is never returned. */
export function futuresQuoteForExpiry(byExpiry: ReadonlyMap<string, number> | Readonly<Record<string, number>> | null | undefined, expiry: string): FuturesQuote | null {
    if (!byExpiry) return null;
    const value = byExpiry instanceof Map ? byExpiry.get(expiry) : (byExpiry as Readonly<Record<string, number>>)[expiry];
    return positive(value) ? { expiry, price: value } : null;
}

export function resolveUnderlying(
    kind: InstrumentKind | null | undefined,
    prices: { spot: number | null | undefined; futures: FuturesQuote | null | undefined; optionExpiry: string },
): UnderlyingResolution {
    if (kind !== 'index' && kind !== 'stock') return { ok: false, reason: 'missing-instrument-type' };
    if (kind === 'index') return positive(prices.spot) ? { ok: true, kind, underlying: prices.spot } : { ok: false, reason: 'missing-spot-price' };
    if (!prices.futures || !positive(prices.futures.price)) return { ok: false, reason: 'missing-futures-price' };
    if (prices.futures.expiry !== prices.optionExpiry) return { ok: false, reason: 'futures-expiry-mismatch' };
    return { ok: true, kind, underlying: prices.futures.price };
}

export interface ContractIvInput {
    kind: InstrumentKind | null | undefined;
    side: OptionSide;
    strike: number;
    /** The option's expiry date, YYYY-MM-DD. */
    expiry: string;
    /** Calendar days to expiry; the time passed to the formula is days / 365. */
    days: number;
    /** EOD close of this contract. */
    close: number | null | undefined;
    spot: number | null | undefined;
    /** Futures price of the stock, with the expiry it belongs to; must match `expiry` (see `futuresQuoteForExpiry`). */
    futures: FuturesQuote | null | undefined;
}

export type ContractIvResult =
    | { ok: true; ivPct: number; underlying: number; riskFreeRate: number; dividendYield: number }
    | { ok: false; reason: ContractIvFailure };

/** A resolved underlying with the approved rate and dividend for its instrument type. */
export interface PricingInputs {
    underlying: number;
    riskFreeRate: number;
    dividendYield: number;
}

/** Implied volatility of one contract's EOD close for already-resolved inputs; no substitution, no invented value. */
export function solveIvInContext(
    inputs: PricingInputs,
    contract: { side: OptionSide; strike: number; days: number; close: number | null | undefined },
): ContractIvResult {
    const { underlying, riskFreeRate, dividendYield } = inputs;
    if (!positive(contract.strike)) return { ok: false, reason: 'invalid-strike' };
    if (!positive(contract.close)) return { ok: false, reason: 'missing-close-price' };
    if (!(contract.days > 0)) return { ok: false, reason: 'no-time-to-expiry' };

    const time = contract.days / 365;
    const [floor, ceiling] = priceBounds(contract.side, underlying, contract.strike, riskFreeRate, dividendYield, time);
    if (contract.close < floor - 1e-9 || contract.close > ceiling + 1e-9) return { ok: false, reason: 'price-outside-bounds' };

    const solved = solveImpliedVolatility(contract.side, contract.close, underlying, contract.strike, riskFreeRate, dividendYield, time);
    if (!Number.isFinite(solved.sigma)) return { ok: false, reason: 'price-outside-bounds' };
    return { ok: true, ivPct: solved.sigma * 100, underlying, riskFreeRate, dividendYield };
}

export function solveContractIv(input: ContractIvInput): ContractIvResult {
    const underlying = resolveUnderlying(input.kind, { spot: input.spot, futures: input.futures, optionExpiry: input.expiry });
    if (!underlying.ok) return underlying;
    const { riskFreeRate, dividendYield } = marketParams(underlying.kind);
    return solveIvInContext({ underlying: underlying.underlying, riskFreeRate, dividendYield }, input);
}

/** Model price at a given volatility with the same approved inputs; used to check a solved IV reproduces its price. */
export function modelPriceForContract(input: Omit<ContractIvInput, 'close'>, ivPct: number): number | null {
    const underlying = resolveUnderlying(input.kind, { spot: input.spot, futures: input.futures, optionExpiry: input.expiry });
    if (!underlying.ok || !(input.days > 0)) return null;
    const { riskFreeRate, dividendYield } = marketParams(underlying.kind);
    return bsPrice(input.side, underlying.underlying, input.strike, riskFreeRate, dividendYield, input.days / 365, ivPct / 100);
}
