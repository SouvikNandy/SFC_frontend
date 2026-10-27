/*
 * The single Black–Scholes implementation for QuantSFC: normal CDF, option price, Greeks, implied-volatility
 * solver and the market parameters (risk-free rate, dividend yield) for indices and stocks.
 *
 * Pure functions, no Angular, no I/O. Units: rates, yields and sigma are DECIMALS (0.055 = 5.5 %), time is in
 * YEARS. Every screen (Options Chain, Greeks, Implied Volatility, Probability, Payoff) must price through here.
 */

export type OptionSide = 'call' | 'put';

/* ---------------- market parameters ---------------- */

/** Whether the underlying is an index (spot index value) or a stock (matching stock-futures price). */
export type InstrumentKind = 'index' | 'stock';

export interface MarketParams {
    /** Continuously compounded risk-free rate, decimal. */
    riskFreeRate: number;
    /** Continuous dividend yield, decimal. */
    dividendYield: number;
}

/**
 * Approved client parameters. The stock risk-free rate of 0.01 % is the client's stated value and is still
 * pending the client's written confirmation: change it here, and only here.
 */
export const MARKET_PARAMS: Readonly<Record<InstrumentKind, MarketParams>> = {
    index: { riskFreeRate: 0.055, dividendYield: 0.01 },
    stock: { riskFreeRate: 0.0001, dividendYield: 0 },
};

export function marketParams(kind: InstrumentKind): MarketParams {
    return MARKET_PARAMS[kind];
}

/* ---------------- normal distribution ---------------- */

/** Abramowitz–Stegun 7.1.26 error function (max error ≈ 1.5e-7). */
export function erf(x: number): number {
    const sign = x < 0 ? -1 : 1;
    const absolute = Math.abs(x);
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const t = 1 / (1 + p * absolute);
    return sign * (1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absolute * absolute));
}

export function normCdf(x: number): number {
    return 0.5 * (1 + erf(x / Math.SQRT2));
}

export function normPdf(x: number): number {
    return Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
}

/* ---------------- price and vega ---------------- */

export function intrinsicValue(side: OptionSide, S: number, K: number): number {
    return side === 'call' ? Math.max(S - K, 0) : Math.max(K - S, 0);
}

/**
 * Black–Scholes–Merton price with continuous dividend yield `q`. At zero (or negative) time, or zero volatility,
 * the option is worth its intrinsic value: that is how expiry day (T = 0) is priced.
 */
export function bsPrice(side: OptionSide, S: number, K: number, r: number, q: number, T: number, sigma: number): number {
    if (T <= 0 || sigma <= 0) return intrinsicValue(side, S, K);
    const rootT = Math.sqrt(T);
    const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * rootT);
    const d2 = d1 - sigma * rootT;
    const dividendDiscount = Math.exp(-q * T), rateDiscount = Math.exp(-r * T);
    return side === 'call'
        ? S * dividendDiscount * normCdf(d1) - K * rateDiscount * normCdf(d2)
        : K * rateDiscount * normCdf(-d2) - S * dividendDiscount * normCdf(-d1);
}

/** Vega per 1.00 (100 volatility points) of sigma; 0 when time or volatility is not positive. */
export function bsVega(S: number, K: number, r: number, q: number, T: number, sigma: number): number {
    if (T <= 0 || sigma <= 0) return 0;
    const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
    return S * Math.exp(-q * T) * normPdf(d1) * Math.sqrt(T);
}

/** No-arbitrage price limits [floor, ceiling] for an option; a market price outside them has no implied volatility. */
export function priceBounds(side: OptionSide, S: number, K: number, r: number, q: number, T: number): [number, number] {
    const discountedUnderlying = S * Math.exp(-q * T);
    const discountedStrike = K * Math.exp(-r * T);
    return side === 'call'
        ? [Math.max(discountedUnderlying - discountedStrike, 0), discountedUnderlying]
        : [Math.max(discountedStrike - discountedUnderlying, 0), discountedStrike];
}

/* ---------------- Greeks ---------------- */

export interface BlackScholesGreeks {
    callPrice: number;
    putPrice: number;
    deltaCall: number;
    deltaPut: number;
    gamma: number;
    /** Per calendar day. */
    thetaCall: number;
    thetaPut: number;
    /** Per 1 volatility point. */
    vega: number;
    /** Per 1 point of interest rate. */
    rhoCall: number;
    rhoPut: number;
    nd1: number;
    d1: number;
    d2: number;
}

/**
 * Call and put price plus Greeks. With no time left (T <= 0), or no volatility, the option is worth its intrinsic value
 * and the sensitivities degenerate (delta is a step, the rest are 0), so nothing divides by zero.
 */
export function blackScholesGreeks(S: number, K: number, r: number, q: number, sigma: number, T: number): BlackScholesGreeks {
    if (!(T > 0) || !(sigma > 0) || !(S > 0) || !(K > 0)) {
        const moneyness = S > K ? Infinity : S < K ? -Infinity : 0;
        return {
            callPrice: intrinsicValue('call', S, K),
            putPrice: intrinsicValue('put', S, K),
            deltaCall: S > K ? 1 : 0,
            deltaPut: S < K ? -1 : 0,
            gamma: 0, thetaCall: 0, thetaPut: 0, vega: 0, rhoCall: 0, rhoPut: 0,
            nd1: 0, d1: moneyness, d2: moneyness,
        };
    }
    const rootT = Math.sqrt(T);
    const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * rootT);
    const d2 = d1 - sigma * rootT;

    const Nd1 = normCdf(d1), Nd2 = normCdf(d2);
    const Nnd1 = normCdf(-d1), Nnd2 = normCdf(-d2);
    const nd1 = normPdf(d1);

    const eqT = Math.exp(-q * T);
    const erT = Math.exp(-r * T);

    const thetaCallYear = -(S * eqT * nd1 * sigma) / (2 * rootT) - r * K * erT * Nd2 + q * S * eqT * Nd1;
    const thetaPutYear = -(S * eqT * nd1 * sigma) / (2 * rootT) + r * K * erT * Nnd2 - q * S * eqT * Nnd1;

    return {
        callPrice: S * eqT * Nd1 - K * erT * Nd2,
        putPrice: K * erT * Nnd2 - S * eqT * Nnd1,
        deltaCall: eqT * Nd1,
        deltaPut: eqT * (Nd1 - 1),
        gamma: (eqT * nd1) / (S * sigma * rootT),
        thetaCall: thetaCallYear / 365,
        thetaPut: thetaPutYear / 365,
        vega: S * eqT * nd1 * rootT / 100,
        rhoCall: K * T * erT * Nd2 / 100,
        rhoPut: -K * T * erT * Nnd2 / 100,
        nd1, d1, d2,
    };
}

/* ---------------- implied volatility ---------------- */

const SIGMA_START = 0.25;
const SIGMA_MIN = 0.0001;
const SIGMA_MAX = 5;
const MAX_NEWTON = 60;
const PRICE_TOL = 1e-8;
const VEGA_FLOOR = 1e-8;
const MAX_BISECTION = 200;
const BISECTION_TOL = 1e-10;

export interface IvSolveStep {
    iteration: number;
    sigma: number;
    price: number;
    residual: number;
    vega: number;
}

export interface IvSolveResult {
    /** Implied volatility, decimal (0.1692 = 16.92 %). */
    sigma: number;
    method: 'newton' | 'bisection';
    iterations: number;
    steps: IvSolveStep[];
}

/**
 * Implied volatility of `marketPrice`: Newton–Raphson from 25 %, falling back to bisection on [0.01 %, 500 %].
 * The caller must have checked the inputs and that the price lies within `priceBounds`.
 * `trace` records the iterations for the Implied Volatility screen.
 */
export function solveImpliedVolatility(
    side: OptionSide, marketPrice: number, S: number, K: number, r: number, q: number, T: number, trace = false,
): IvSolveResult {
    const steps: IvSolveStep[] = [];
    // No volatility can be recovered without time to expiry or a positive price/underlying/strike.
    if (!(T > 0) || !(S > 0) || !(K > 0) || !(marketPrice > 0)) return { sigma: Number.NaN, method: 'bisection', iterations: 0, steps };
    let sigma = SIGMA_START;
    for (let iteration = 1; iteration <= MAX_NEWTON; iteration += 1) {
        const price = bsPrice(side, S, K, r, q, T, sigma);
        const residual = price - marketPrice;
        const vega = bsVega(S, K, r, q, T, sigma);
        if (trace) steps.push({ iteration, sigma, price, residual, vega });
        if (Math.abs(residual) < PRICE_TOL) return { sigma, method: 'newton', iterations: iteration, steps };
        if (vega < VEGA_FLOOR) break;
        const next = sigma - residual / vega;
        if (!Number.isFinite(next) || next <= SIGMA_MIN || next > SIGMA_MAX) break;
        sigma = next;
    }

    let low = SIGMA_MIN, high = SIGMA_MAX, iteration = 0;
    for (iteration = 1; iteration <= MAX_BISECTION; iteration += 1) {
        const mid = (low + high) / 2;
        const price = bsPrice(side, S, K, r, q, T, mid);
        if (trace && iteration % 8 === 0) {
            steps.push({ iteration: MAX_NEWTON + iteration, sigma: mid, price, residual: price - marketPrice, vega: bsVega(S, K, r, q, T, mid) });
        }
        if (price > marketPrice) high = mid;
        else low = mid;
        if (high - low < BISECTION_TOL) break;
    }
    return { sigma: (low + high) / 2, method: 'bisection', iterations: iteration, steps };
}
