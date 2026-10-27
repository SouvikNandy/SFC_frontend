/*
 * Option pricing for the Payoff Tool: per-leg valuation with each leg's own implied volatility.
 *
 * Black-Scholes comes from shared/pricing/option-pricing.ts. Each leg's IV is solved (outside this file) from that leg's
 * own entry premium with the approved underlying, rate and dividend, so the model reproduces the entry premium at the
 * entry underlying and today's date, with no separate calibration. The IV slider multiplies every leg's IV.
 *
 * Units: `iv` / `sigma` and the multiplier ratio are DECIMALS (0.125 = 12.5 %, x1.00 = 1); rate and dividend are decimals.
 */
import { bsPrice, erf, intrinsicValue, normCdf } from '../../../shared/pricing/option-pricing';
import { OptionType, PayoffLeg, PricedLeg } from './payoff.model';

// The Black-Scholes primitives live in shared/pricing/option-pricing.ts; re-exported under their old names.
export { erf, normCdf };
export const intrinsic = (type: OptionType, S: number, K: number): number => intrinsicValue(type, S, K);
export const bsValue = (type: OptionType, S: number, K: number, r: number, q: number, T: number, sigma: number): number => bsPrice(type, S, K, r, q, T, sigma);

export const DAYS_YEAR = 365;

/** Model premium rounded to 2 dp (Custom mode starting premiums and "Reprice"). */
export function modelPremium(type: OptionType, underlying: number, strike: number, days: number, sigma: number, rate: number, dividend: number): number {
    return Math.round(bsValue(type, underlying, strike, rate, dividend, days / DAYS_YEAR, sigma) * 100) / 100;
}

/* ---------------- per-leg valuation ---------------- */

/**
 * A priced leg with its own implied volatility (decimal) and the rate and dividend it was solved with. `iv` is NaN for a
 * leg with no time left (expiry day): it is worth its intrinsic value and needs no volatility.
 */
export interface ValuedLeg extends PricedLeg {
    iv: number;
    rate: number;
    dividend: number;
}

export function valueLegs(legs: PricedLeg[], ivByLegId: Readonly<Record<number, number>>, rate: number, dividend: number): ValuedLeg[] {
    return legs.map(leg => ({ ...leg, iv: ivByLegId[leg.id] ?? Number.NaN, rate, dividend }));
}

/** Model mark of one leg for a scenario price/date; `ivMultiplier` is a ratio (1 = x1.00). Intrinsic value once the leg has expired. */
export function legMark(leg: ValuedLeg, S: number, evalDay: number, ivMultiplier: number): number {
    const remaining = leg.expiryDays - evalDay;
    if (remaining <= 0) return intrinsic(leg.type, S, leg.strike);
    return Math.max(bsValue(leg.type, S, leg.strike, leg.rate, leg.dividend, remaining / DAYS_YEAR, leg.iv * ivMultiplier), 0);
}

/** Simple (unweighted) mean IV of the nearest-expiry legs, as a decimal before the multiplier; NaN if none. */
export function nearestExpiryAverageIv(legs: ReadonlyArray<Pick<PayoffLeg, 'expiryDays'> & { iv: number }>): number {
    const usable = legs.filter(leg => leg.expiryDays >= 0 && Number.isFinite(leg.iv));
    if (!usable.length) return Number.NaN;
    const near = Math.min(...usable.map(leg => leg.expiryDays));
    const ivs = usable.filter(leg => leg.expiryDays === near).map(leg => leg.iv);
    return ivs.reduce((sum, iv) => sum + iv, 0) / ivs.length;
}
