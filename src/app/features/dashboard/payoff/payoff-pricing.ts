/*
 * Option pricing for the Payoff Tool: Black-Scholes primitives, the approved chain-IV formula
 * (prototype/payoff-tool-pro_13.html chainIV) and per-leg valuation with entry-price calibration.
 *
 * Units: reference volatility is in PERCENT (as in the prototype); every `iv`, `sigma` and
 * `ivMultiplier` ratio produced here is a DECIMAL (0.125 = 12.5 %, ×1.00 = 1).
 */
import { OptionType, PayoffLeg, PricedLeg } from './payoff.model';

export const DAYS_YEAR = 365;

/** Bounds and live-mode uplift of the approved chain-IV formula. */
const CHAIN_ADJ_MIN = -0.45;
const CHAIN_ADJ_MAX = 1.2;
const LIVE_IV_FACTOR = 1.03;

/* ---------------- Black-Scholes primitives ---------------- */

export function erf(x: number): number {
    const s = x < 0 ? -1 : 1;
    x = Math.abs(x);
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const t = 1 / (1 + p * x);
    return s * (1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x));
}

export function normCdf(x: number): number {
    return 0.5 * (1 + erf(x / Math.SQRT2));
}

export function intrinsic(type: OptionType, S: number, K: number): number {
    return type === 'call' ? Math.max(S - K, 0) : Math.max(K - S, 0);
}

export function bsValue(type: OptionType, S: number, K: number, r: number, q: number, T: number, sigma: number): number {
    if (T <= 0 || sigma <= 0) return intrinsic(type, S, K);
    const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    const eq = Math.exp(-q * T), er = Math.exp(-r * T);
    return type === 'call'
        ? S * eq * normCdf(d1) - K * er * normCdf(d2)
        : K * er * normCdf(-d2) - S * eq * normCdf(-d1);
}

/** Theoretical premium rounded to 2 dp, as the prototype's presets and "Reprice" use. */
export function theoreticalPremium(type: OptionType, spot: number, strike: number, days: number, sigma: number): number {
    return Math.round(bsValue(type, spot, strike, 0, 0, days / DAYS_YEAR, sigma) * 100) / 100;
}

/* ---------------- approved chain IV ---------------- */

/**
 * Approved chain-IV formula (prototype chainIV), exact constants and bounds.
 * @param referenceVolPct underlying reference volatility in percent (HV-20 from the feed)
 * @returns the strike's IV as a decimal, or NaN when an input is invalid (never a substituted default)
 */
export function chainIV(spot: number, strike: number, referenceVolPct: number, live = false): number {
    if (!(spot > 0) || !(strike > 0) || !(referenceVolPct > 0)) return Number.NaN;
    const base = referenceVolPct / 100;
    const m = Math.log(strike / spot);
    const adj = Math.max(CHAIN_ADJ_MIN, Math.min(CHAIN_ADJ_MAX, -2.0 * m + 25.0 * m * m));
    const iv = base * (1 + adj);
    return live ? iv * LIVE_IV_FACTOR : iv;
}

/* ---------------- per-leg valuation ---------------- */

/**
 * A priced leg with its own sticky-strike IV.
 * `iv` is the chain IV at the entry spot (before the IV multiplier). `entryOffset` is the calibration
 * that makes the model mark equal the entry premium at T+0 / entry spot (the chain IV does not reproduce
 * the quoted premium exactly); it fades linearly to zero at the leg's expiry, so expiry value is intrinsic.
 */
export interface ValuedLeg extends PricedLeg {
    iv: number;
    entryOffset: number;
}

export function valueLegs(legs: PricedLeg[], spot: number, referenceVolPct: number, live = false): ValuedLeg[] {
    return legs.map(leg => {
        const iv = chainIV(spot, leg.strike, referenceVolPct, live);
        const model = bsValue(leg.type, spot, leg.strike, 0, 0, leg.expiryDays / DAYS_YEAR, iv);
        return { ...leg, iv, entryOffset: leg.premium - model };
    });
}

/** Model mark of one leg for a scenario price/date; `ivMultiplier` is a ratio (1 = ×1.00). */
export function legMark(leg: ValuedLeg, S: number, evalDay: number, ivMultiplier: number): number {
    const remaining = leg.expiryDays - evalDay;
    if (remaining <= 0) return intrinsic(leg.type, S, leg.strike);
    const model = bsValue(leg.type, S, leg.strike, 0, 0, remaining / DAYS_YEAR, leg.iv * ivMultiplier);
    const fade = Math.min(Math.max(remaining / leg.expiryDays, 0), 1);
    return Math.max(model + leg.entryOffset * fade, 0);
}

/** Simple (unweighted) mean IV of the nearest-expiry legs, as a decimal before the multiplier; NaN if none. */
export function nearestExpiryAverageIv(legs: ReadonlyArray<Pick<PayoffLeg, 'expiryDays'> & { iv: number }>): number {
    const usable = legs.filter(leg => leg.expiryDays > 0 && Number.isFinite(leg.iv));
    if (!usable.length) return Number.NaN;
    const near = Math.min(...usable.map(leg => leg.expiryDays));
    const ivs = usable.filter(leg => leg.expiryDays === near).map(leg => leg.iv);
    return ivs.reduce((sum, iv) => sum + iv, 0) / ivs.length;
}
