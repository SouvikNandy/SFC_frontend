/*
 * Payoff calculation engine: the single source of truth for the Payoff Tool.
 * Ported from prototype/payoff-tool-pro_11.html; constants, grid sizes and
 * formulas are kept identical so numerical output matches the prototype.
 * The graph, heat-map table, summary strip and strike ladder all read the
 * PayoffResult produced by computePayoff().
 */
import {
    HeatColumn,
    HeatRow,
    PayoffCurvePoint,
    PayoffHeatmap,
    PayoffInputs,
    PayoffLeg,
    PayoffResult,
    PricedLeg,
    ProfitZone,
} from './payoff.model';
import { DAYS_YEAR, ValuedLeg, legMark, nearestExpiryAverageIv, normCdf, valueLegs } from './payoff-pricing';

// Pricing primitives live in payoff-pricing.ts; re-exported so existing imports keep working.
export { DAYS_YEAR, bsValue, erf, intrinsic, normCdf, theoreticalPremium } from './payoff-pricing';

const BREAKEVEN_SAMPLES = 1401;
const BISECTION_STEPS = 60;
/* ---------------- position valuation ---------------- */

const sgn = (leg: Pick<PayoffLeg, 'direction'>) => (leg.direction === 'long' ? 1 : -1);
const mult = (leg: Pick<PayoffLeg, 'quantity' | 'lotSize'>) => leg.quantity * leg.lotSize;

/** Position P&L: every leg is marked with its own IV × `ivMultiplier` (ratio, 1 = ×1.00), less its entry premium. */
export function evaluatePosition(legs: ValuedLeg[], S: number, evalDay: number, ivMultiplier: number): number {
    let total = 0;
    for (const leg of legs) total += sgn(leg) * (legMark(leg, S, evalDay, ivMultiplier) - leg.premium) * mult(leg);
    return total;
}

export function netPremium(legs: PricedLeg[]): number {
    return legs.reduce((sum, leg) => sum + sgn(leg) * leg.premium * mult(leg), 0);
}

export function priceRange(spot: number, rangePct: number, legs: PayoffLeg[]): [number, number] {
    const pct = rangePct / 100;
    const strikes = legs.map(leg => leg.strike);
    const lo = Math.min(spot * (1 - pct), Math.min(...strikes) * 0.985);
    const hi = Math.max(spot * (1 + pct), Math.max(...strikes) * 1.015);
    return [Math.max(lo, 0.01), hi];
}

function payoffCurve(legs: ValuedLeg[], lo: number, hi: number, evalDay: number, ivMult: number, n: number): PayoffCurvePoint[] {
    const out: PayoffCurvePoint[] = [];
    for (let i = 0; i < n; i++) {
        const price = lo + (hi - lo) * i / (n - 1);
        out.push({ price, pnl: evaluatePosition(legs, price, evalDay, ivMult) });
    }
    return out;
}

function findBreakevens(legs: ValuedLeg[], lo: number, hi: number, evalDay: number, ivMult: number): number[] {
    const f = (S: number) => evaluatePosition(legs, S, evalDay, ivMult);
    const xs: number[] = [], ys: number[] = [];
    for (let i = 0; i < BREAKEVEN_SAMPLES; i++) {
        const x = lo + (hi - lo) * i / (BREAKEVEN_SAMPLES - 1);
        xs.push(x);
        ys.push(f(x));
    }
    const roots: number[] = [];
    for (let i = 0; i < BREAKEVEN_SAMPLES - 1; i++) {
        if (ys[i] === 0) roots.push(xs[i]);
        else if (ys[i] * ys[i + 1] < 0) {
            let a = xs[i], b = xs[i + 1];
            for (let k = 0; k < BISECTION_STEPS; k++) {
                const m = (a + b) / 2;
                if (f(a) * f(m) <= 0) b = m; else a = m;
            }
            roots.push((a + b) / 2);
        }
    }
    const out: number[] = [];
    roots.sort((p, r) => p - r).forEach(root => {
        if (!out.length || Math.abs(root - out[out.length - 1]) > (hi - lo) * 1e-4) out.push(root);
    });
    return out;
}

function profitZones(legs: ValuedLeg[], lo: number, hi: number, evalDay: number, ivMult: number, breakevens: number[]): ProfitZone[] {
    const bounds = [lo, ...breakevens, hi];
    const zones: ProfitZone[] = [];
    for (let i = 0; i < bounds.length - 1; i++) {
        const a = bounds[i], c = bounds[i + 1];
        if (evaluatePosition(legs, (a + c) / 2, evalDay, ivMult) > 0) {
            const left = a === lo ? -Infinity : a, right = c === hi ? Infinity : c;
            if (zones.length && zones[zones.length - 1][1] === left) zones[zones.length - 1][1] = right;
            else zones.push([left, right]);
        }
    }
    return zones;
}

/* ---------------- lognormal distribution (zero drift) ---------------- */

function lognormParams(spot: number, sigma: number, days: number): { centre: number; sd: number } {
    const T = Math.max(days, 1e-9) / DAYS_YEAR;
    return { centre: Math.log(spot) - 0.5 * sigma * sigma * T, sd: sigma * Math.sqrt(T) };
}

function density(S: number, spot: number, sigma: number, days: number): number {
    if (S <= 0) return 0;
    const { centre, sd } = lognormParams(spot, sigma, days);
    const z = (Math.log(S) - centre) / sd;
    return Math.exp(-z * z / 2) / (Math.sqrt(2 * Math.PI) * S * sd);
}

function probBelow(K: number, spot: number, sigma: number, days: number): number {
    if (K <= 0) return 0;
    const { centre, sd } = lognormParams(spot, sigma, days);
    return normCdf((Math.log(K) - centre) / sd);
}

function chanceOfProfit(zones: ProfitZone[], spot: number, sigma: number, days: number): number {
    let total = 0;
    zones.forEach(([a, b]) => {
        const upper = b === Infinity ? 1 : probBelow(b, spot, sigma, days);
        const lower = a === -Infinity ? 0 : probBelow(a, spot, sigma, days);
        total += Math.max(upper - lower, 0);
    });
    return Math.min(Math.max(total, 0), 1) * 100;
}

/* ---------------- dates ---------------- */

export function addDays(date: Date, days: number): Date {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
}

const isWeekend = (date: Date) => date.getDay() === 0 || date.getDay() === 6;

/* ---------------- heat map: real dates across, prices down ---------------- */

function buildHeatmap(legs: ValuedLeg[], inputs: PayoffInputs, lo: number, hi: number, near: number, ivMult: number): PayoffHeatmap {
    let cols: Array<{ days: number; date: Date }> = [];
    for (let d = 0; d <= near; d++) {
        const date = addDays(inputs.baseDate, d);
        if (!isWeekend(date)) cols.push({ days: d, date });
    }
    if (!cols.length || cols[cols.length - 1].days !== near) cols.push({ days: near, date: addDays(inputs.baseDate, near) });
    const maxCols = inputs.narrow ? 6 : 14;
    if (cols.length > maxCols) {
        const keep: typeof cols = [], n = cols.length, k = maxCols - 1;
        for (let i = 0; i < k; i++) keep.push(cols[Math.round(i * (n - 1) / k)]);
        keep.push(cols[n - 1]);
        cols = keep.filter((col, i, all) => i === 0 || col.days !== all[i - 1].days);
    }

    const rowCount = inputs.narrow ? 15 : 21;
    const prices: number[] = [];
    for (let i = 0; i < rowCount; i++) prices.push(hi - (hi - lo) * i / (rowCount - 1));

    let spotRow = 0, best = Infinity;
    prices.forEach((price, i) => {
        if (Math.abs(price - inputs.spot) < best) { best = Math.abs(price - inputs.spot); spotRow = i; }
    });

    // Colour intensity is scaled to the largest absolute P&L shown in the grid.
    const grid = prices.map(price => cols.map(col => evaluatePosition(legs, price, col.days, ivMult)));
    let peak = 0;
    grid.forEach(row => row.forEach(value => { peak = Math.max(peak, Math.abs(value)); }));
    if (peak <= 0) peak = 1;

    const columns: HeatColumn[] = cols.map(col => ({ ...col, isExpiry: col.days === near }));
    const rows: HeatRow[] = prices.map((price, ri) => ({
        price,
        movePct: (price / inputs.spot - 1) * 100,
        isSpot: ri === spotRow,
        cells: grid[ri].map(pnl => {
            const intensity = Math.min(Math.abs(pnl) / peak, 1);
            return { pnl, positive: pnl >= 0, level: Math.round(intensity * 10), strong: intensity > 0.5 };
        }),
    }));
    return { columns, rows };
}

/* ---------------- single entry point ---------------- */

/**
 * Prices every leg at its own chain IV, then builds the curves, metrics and heat map.
 * Returns null when there is nothing valid to price (no legs, or an unusable spot / reference volatility),
 * so callers never receive NaN values.
 */
export function computePayoff(inputs: PayoffInputs): PayoffResult | null {
    const { spot } = inputs;
    const ivMult = inputs.ivMultiplier / 100;
    const legs = valueLegs(inputs.legs, spot, inputs.referenceVol, inputs.live);
    const averageIv = nearestExpiryAverageIv(legs);
    if (!legs.length || !(ivMult > 0) || !(averageIv > 0) || legs.some(leg => !Number.isFinite(leg.iv) || !(leg.expiryDays > 0))) return null;
    // Probability distribution: nearest-expiry average leg IV × multiplier. Leg valuation uses each leg's own IV.
    const probIv = averageIv * ivMult;
    const effVol = probIv * 100;
    const usedExpiries = Array.from(new Set(legs.map(leg => leg.expiryDays))).sort((a, b) => a - b);
    const near = usedExpiries[0];
    const far = usedExpiries[usedExpiries.length - 1];
    const evalDay = Math.min(Math.max(inputs.evalDay, 0), Math.max(near, 1));
    const [lo, hi] = priceRange(spot, inputs.rangePct, legs);
    const points = inputs.narrow ? 161 : 281;

    const curveExpiry = payoffCurve(legs, lo, hi, near, ivMult, points);
    const curveEval = payoffCurve(legs, lo, hi, evalDay, ivMult, points);
    const breakevens = findBreakevens(legs, lo, hi, near, ivMult);
    const zones = profitZones(legs, lo, hi, near, ivMult, breakevens);

    const pnlSamples = curveExpiry.map(point => point.pnl);
    Array.from(new Set(legs.map(leg => leg.strike))).forEach(strike => {
        if (strike >= lo && strike <= hi) pnlSamples.push(evaluatePosition(legs, strike, near, ivMult));
    });
    const callExposure = legs.filter(leg => leg.type === 'call').reduce((sum, leg) => sum + sgn(leg) * mult(leg), 0);
    const putExposure = -legs.filter(leg => leg.type === 'put').reduce((sum, leg) => sum + sgn(leg) * mult(leg), 0);

    return {
        near,
        far,
        isCalendar: usedExpiries.length > 1,
        usedExpiries,
        evalDay,
        effVol,
        lo,
        hi,
        curveExpiry,
        curveEval,
        breakevens,
        densities: curveExpiry.map(point => density(point.price, spot, probIv, near)),
        metrics: {
            netPremium: netPremium(legs),
            maxProfit: Math.max(...pnlSamples),
            maxLoss: Math.min(...pnlSamples),
            profitUnlimited: callExposure > 0 || putExposure < 0,
            lossUnlimited: callExposure < 0 || putExposure > 0,
            chanceOfProfit: chanceOfProfit(zones, spot, probIv, near),
            zones,
        },
        heatmap: buildHeatmap(legs, inputs, lo, hi, near, ivMult),
    };
}
