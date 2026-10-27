import { describe, expect, it } from 'vitest';

import { solveIvInContext } from '../../../shared/pricing/contract-iv';
import { computePayoff, evaluatePosition } from './payoff-engine';
import { DAYS_YEAR, ValuedLeg, bsValue, intrinsic, legMark, modelPremium, nearestExpiryAverageIv, valueLegs } from './payoff-pricing';
import { STRATEGY_NAMES, StrategyContext, buildStrategy } from './payoff-strategies';
import { PayoffInputs, PayoffStrategy, PricedLeg } from './payoff.model';

const SPOT = 22630;
const LOT = 75;
// Approved index parameters: risk-free 5.5 %, dividend yield 1 %.
const RATE = 0.055;
const DIVIDEND = 0.01;
const PRICING = { underlying: SPOT, riskFreeRate: RATE, dividendYield: DIVIDEND };

/** A synthetic market smile used only to generate realistic quoted premiums for the tests. */
const smileVol = (strike: number) => {
  const m = Math.log(strike / SPOT);
  return 0.125 * (1 + Math.max(-0.45, Math.min(1.2, -2 * m + 25 * m * m)));
};
/** A quoted premium (2 dp) from that smile, so each leg has its own market IV. */
const quotedPremium = (type: 'call' | 'put', strike: number, days: number) =>
  Math.round((bsValue(type, SPOT, strike, RATE, DIVIDEND, days / DAYS_YEAR, smileVol(strike)) + 0.4) * 100) / 100;

/** Each leg's IV solved from its own premium (the same call the component makes). Legs expiring today need none. */
function solvedIvs(legs: PricedLeg[]): Record<number, number> {
  const ivs: Record<number, number> = {};
  for (const leg of legs) {
    if (!(leg.expiryDays > 0)) continue;
    const solved = solveIvInContext(PRICING, { side: leg.type, strike: leg.strike, days: leg.expiryDays, close: leg.premium });
    if (solved.ok) ivs[leg.id] = solved.ivPct / 100;
  }
  return ivs;
}
const valued = (legs: PricedLeg[]): ValuedLeg[] => valueLegs(legs, solvedIvs(legs), RATE, DIVIDEND);

function presetLegs(strategy: PayoffStrategy): PricedLeg[] {
  let id = 0;
  const ctx: StrategyContext = {
    spot: SPOT, step: 50, lotSize: LOT, sigma: 0.125, expiries: [16, 23], existing: [],
    premium: quotedPremium, strike: target => target, nextId: () => ++id,
  };
  return buildStrategy(strategy, ctx) as PricedLeg[];
}

const leg = (over: Partial<PricedLeg>): PricedLeg => ({
  id: 1, type: 'call', direction: 'long', strike: 22600, premium: 150, quantity: 1, expiryDays: 16, lotSize: LOT, ...over,
});

const inputs = (legs: PricedLeg[], over: Partial<PayoffInputs> = {}): PayoffInputs => ({
  legs, spot: SPOT, rate: RATE, dividend: DIVIDEND, legIvs: solvedIvs(legs), ivMultiplier: 100, rangePct: 6, evalDay: 0,
  baseDate: new Date(2026, 9, 15), narrow: false, ...over,
});

describe('per-leg IV solved from each leg\'s own premium', () => {
  const legs = [
    leg({ id: 1, strike: 22200, premium: quotedPremium('call', 22200, 16) }),
    leg({ id: 2, strike: 22600, premium: quotedPremium('call', 22600, 16) }),
    leg({ id: 3, strike: 23000, expiryDays: 23, premium: quotedPremium('call', 23000, 23) }),
  ];

  it('gives each leg the IV its premium implies, so legs at different strikes differ', () => {
    const ivs = solvedIvs(legs);
    expect(ivs[1]).toBeCloseTo(smileVol(22200) + 0, 1); // the +0.40 premium bump moves it a little, within 1 vol point
    expect(new Set(Object.values(ivs).map(iv => iv.toFixed(6))).size).toBe(3);
    expect(valued(legs).map(l => l.iv)).toEqual([ivs[1], ivs[2], ivs[3]]);
  });

  it('changing one leg does not alter another leg\'s IV', () => {
    const before = solvedIvs(legs);
    const after = solvedIvs([legs[0], { ...legs[1], strike: 22900, premium: quotedPremium('call', 22900, 16) }, legs[2]]);
    expect(after[1]).toBe(before[1]);
    expect(after[3]).toBe(before[3]);
    expect(after[2]).not.toBe(before[2]);
  });

  it('averages only the nearest-expiry legs (unweighted)', () => {
    const v = valued(legs);
    expect(nearestExpiryAverageIv(v)).toBeCloseTo((v[0].iv + v[1].iv) / 2, 12);
    expect(nearestExpiryAverageIv([])).toBeNaN();
  });

  it('prices a leg at its own IV x multiplier with the approved rate and dividend', () => {
    const [first] = valued([leg({ strike: 22400, premium: quotedPremium('call', 22400, 16) })]);
    const expected = (m: number) => bsValue('call', SPOT, 22400, RATE, DIVIDEND, 16 / DAYS_YEAR, first.iv * m);
    expect(legMark(first, SPOT, 0, 1)).toBeCloseTo(expected(1), 9);
    expect(legMark(first, SPOT, 0, 1.5)).toBeCloseTo(expected(1.5), 9);
    expect(legMark(first, SPOT, 0, 1.5)).toBeGreaterThan(legMark(first, SPOT, 0, 1));
  });

  it('reproduces the entry premium at the entry underlying and today, with no calibration', () => {
    const l = leg({ strike: 22400, premium: 312.35 });
    const [v] = valued([l]);
    expect(legMark(v, SPOT, 0, 1)).toBeCloseTo(312.35, 6);
  });
});

describe('computePayoff: IV label and probability inputs', () => {
  const legs = [
    leg({ id: 1, strike: 22400, premium: quotedPremium('call', 22400, 16) }),
    leg({ id: 2, strike: 22800, premium: quotedPremium('call', 22800, 16) }),
    leg({ id: 3, strike: 22600, premium: quotedPremium('call', 22600, 23), expiryDays: 23 }),
  ];

  it('effVol is the nearest-expiry average IV x multiplier', () => {
    const v = valued(legs);
    const avg = (v[0].iv + v[1].iv) / 2;
    expect(computePayoff(inputs(legs, { ivMultiplier: 150 }))!.effVol).toBeCloseTo(avg * 1.5 * 100, 9);
    expect(computePayoff(inputs(legs, { ivMultiplier: 100 }))!.effVol).toBeCloseTo(avg * 100, 9);
  });

  it('is unaffected by a farther-expiry leg, but follows the nearest legs', () => {
    const without = computePayoff(inputs(legs.slice(0, 2)))!;
    const withFar = computePayoff(inputs(legs))!;
    expect(withFar.effVol).toBeCloseTo(without.effVol, 9);
    const moved = computePayoff(inputs([{ ...legs[0], strike: 21800, premium: quotedPremium('call', 21800, 16) }, legs[1]]))!;
    expect(moved.effVol).not.toBeCloseTo(without.effVol, 3);
  });

  it('chance of profit stays within 0-100 and responds to the multiplier', () => {
    const low = computePayoff(inputs(legs, { ivMultiplier: 60 }))!.metrics.chanceOfProfit;
    const high = computePayoff(inputs(legs, { ivMultiplier: 200 }))!.metrics.chanceOfProfit;
    [low, high].forEach(v => { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(100); });
    expect(low).not.toBeCloseTo(high, 3);
  });

  it('returns null instead of NaN for empty positions or a leg with time left but no solved IV', () => {
    expect(computePayoff(inputs([]))).toBeNull();
    expect(computePayoff(inputs(legs, { legIvs: {} }))).toBeNull();
    expect(computePayoff(inputs(legs, { legIvs: { ...solvedIvs(legs), 2: Number.NaN } }))).toBeNull();
  });

  it('produces only finite chart values', () => {
    const result = computePayoff(inputs(legs, { evalDay: 0 }))!;
    const values = [...result.curveEval, ...result.curveExpiry].flatMap(p => [p.price, p.pnl]);
    expect(values.every(Number.isFinite)).toBe(true);
    expect(result.densities.every(Number.isFinite)).toBe(true);
    expect(result.heatmap.rows.every(r => r.cells.every(c => Number.isFinite(c.pnl)))).toBe(true);
  });
});

describe('T+0 invariant: P&L is zero at the entry underlying for every strategy', () => {
  const strategies = (Object.keys(STRATEGY_NAMES) as PayoffStrategy[]).filter(name => name !== 'custom_position');

  it.each(strategies)('%s', strategy => {
    const legs = presetLegs(strategy);
    expect(legs.length).toBeGreaterThan(0);
    const ivs = solvedIvs(legs);
    // Every leg's IV could be solved from its own quoted premium, and that alone makes T+0 P&L zero.
    expect(Object.keys(ivs).length).toBe(legs.length);
    expect(evaluatePosition(valued(legs), SPOT, 0, 1)).toBeCloseTo(0, 5);
  });

  it('holds for a custom multi-leg position with short legs and quantities', () => {
    const legs = [
      leg({ id: 1, direction: 'short', strike: 22700, premium: quotedPremium('call', 22700, 16), quantity: 3 }),
      leg({ id: 2, type: 'put', strike: 22300, premium: quotedPremium('put', 22300, 23), quantity: 2, expiryDays: 23 }),
      leg({ id: 3, type: 'put', direction: 'short', strike: 22500, premium: quotedPremium('put', 22500, 9), expiryDays: 9 }),
    ];
    expect(evaluatePosition(valued(legs), SPOT, 0, 1)).toBeCloseTo(0, 5);
  });

  it('computePayoff starts at T+0 when asked for evalDay 0', () => {
    const result = computePayoff(inputs(presetLegs('double_calendar'), { evalDay: 0 }))!;
    expect(result.evalDay).toBe(0);
    expect(result.curveEval.every(p => Number.isFinite(p.pnl))).toBe(true);
  });

  it('a multiplier other than x1.00 legitimately moves T+0 P&L (vol shock)', () => {
    expect(evaluatePosition(valued(presetLegs('long_straddle')), SPOT, 0, 1.5)).toBeGreaterThan(0);
  });
});

describe('expiry accounting, signs, quantity and lot', () => {
  const premium = quotedPremium('call', 22600, 16);

  it('a leg is worth intrinsic at expiry; P&L = (intrinsic - premium) x qty x lot', () => {
    const v = valued([leg({ strike: 22600, premium, quantity: 2 })]);
    for (const spot of [21500, 22600, 23400]) {
      expect(evaluatePosition(v, spot, 16, 1)).toBeCloseTo((intrinsic('call', spot, 22600) - premium) * 2 * LOT, 9);
    }
  });

  it('long and short legs have opposite P&L; quantity and lot scale exactly once', () => {
    const long = valued([leg({ premium, quantity: 1 })]);
    const short = valued([leg({ premium, direction: 'short', quantity: 1 })]);
    const triple = valued([leg({ premium, quantity: 3 })]);
    for (const day of [0, 8, 16]) {
      expect(evaluatePosition(short, 22900, day, 1)).toBeCloseTo(-evaluatePosition(long, 22900, day, 1), 9);
      expect(evaluatePosition(triple, 22900, day, 1)).toBeCloseTo(3 * evaluatePosition(long, 22900, day, 1), 9);
    }
    const bigLot = valued([leg({ premium, lotSize: 150 })]);
    expect(evaluatePosition(bigLot, 22900, 8, 1)).toBeCloseTo(2 * evaluatePosition(long, 22900, 8, 1), 9);
  });

  it('no artificial offset exists: the mark is the plain Black-Scholes value, and intrinsic at expiry', () => {
    const [v] = valued([leg({ premium })]);
    expect(legMark(v, 23000, 16, 1)).toBeCloseTo(intrinsic('call', 23000, 22600), 12);
    expect(legMark(v, 23000, 20, 1)).toBeCloseTo(intrinsic('call', 23000, 22600), 12);
    expect(legMark(v, 23000, 5, 1)).toBeCloseTo(bsValue('call', 23000, 22600, RATE, DIVIDEND, 11 / DAYS_YEAR, v.iv), 12);
  });

  it('mixed expiries: each leg uses its own remaining time; premium accounting unchanged', () => {
    const legs = [
      leg({ id: 1, direction: 'short', premium: quotedPremium('call', 22600, 16), expiryDays: 16 }),
      leg({ id: 2, premium: quotedPremium('call', 22600, 23), expiryDays: 23 }),
    ];
    const [near, far] = valued(legs);
    // At the near expiry the far leg still has 7 days of time value, the near leg is intrinsic.
    expect(legMark(near, SPOT, 16, 1)).toBeCloseTo(intrinsic('call', SPOT, 22600), 12);
    const farMark = legMark(far, SPOT, 16, 1);
    expect(farMark).toBeGreaterThan(intrinsic('call', SPOT, 22600));
    expect(farMark).toBeCloseTo(bsValue('call', SPOT, 22600, RATE, DIVIDEND, 7 / DAYS_YEAR, far.iv), 9);
    const result = computePayoff(inputs(legs))!;
    expect(result.metrics.netPremium).toBeCloseTo((-legs[0].premium + legs[1].premium) * LOT, 9);
    expect(result.isCalendar).toBe(true);
  });

  it('model premiums round-trip: a model premium at volatility v solves back to v', () => {
    const modeled = modelPremium('put', SPOT, 22300, 30, 0.2, RATE, DIVIDEND);
    const solved = solveIvInContext(PRICING, { side: 'put', strike: 22300, days: 30, close: modeled });
    expect(solved.ok && solved.ivPct).toBeCloseTo(20, 1);
  });
});

describe('expiry day (zero days to expiry)', () => {
  const expiring = leg({ expiryDays: 0, strike: 22600, premium: 40 }); // long 22600 call expiring today

  it('is priced at intrinsic value, needs no IV, and has no NaN anywhere', () => {
    expect(solvedIvs([expiring])).toEqual({});
    const result = computePayoff(inputs([expiring]))!;
    expect(result).not.toBeNull();
    expect(result.near).toBe(0);
    expect(result.evalDay).toBe(0);
    const pnlAt = (price: number) => (Math.max(price - 22600, 0) - 40) * LOT;
    for (const point of result.curveExpiry) expect(point.pnl).toBeCloseTo(pnlAt(point.price), 6);
    expect(result.curveExpiry.every(point => Number.isFinite(point.pnl))).toBe(true);
    expect(result.heatmap.rows.every(row => row.cells.every(cell => Number.isFinite(cell.pnl)))).toBe(true);
    expect(result.metrics.maxProfit).toSatisfy(Number.isFinite);
    expect(result.breakevens.length).toBe(1);
    expect(result.breakevens[0]).toBeCloseTo(22640, 1);
    expect(result.effVol).toBe(0);
  });

  it('treats the expiry-day outcome as certain: chance of profit is 0 or 100, and there is no density curve', () => {
    const inTheMoney = computePayoff(inputs([leg({ expiryDays: 0, strike: 22000, premium: 40 })]))!; // spot 22630, intrinsic 630 > 40
    const outOfTheMoney = computePayoff(inputs([leg({ expiryDays: 0, strike: 23500, premium: 40 })]))!;
    expect(inTheMoney.metrics.chanceOfProfit).toBeCloseTo(100, 6);
    expect(outOfTheMoney.metrics.chanceOfProfit).toBeCloseTo(0, 6);
    expect(inTheMoney.densities.every(value => value === 0)).toBe(true);
  });

  it('keeps the evaluation date at expiry day, and a longer-dated leg is still valued with time left', () => {
    const farLeg = leg({ id: 2, expiryDays: 7, direction: 'short', strike: 22600, premium: quotedPremium('call', 22600, 7) });
    const calendar = computePayoff(inputs([expiring, farLeg], { evalDay: 5 }))!;
    expect(calendar.near).toBe(0);
    expect(calendar.far).toBe(7);
    expect(calendar.evalDay).toBe(0); // clamped to the nearest expiry
    const atSpot = calendar.curveExpiry.reduce((best, point) => (Math.abs(point.price - SPOT) < Math.abs(best.price - SPOT) ? point : best));
    expect(Number.isFinite(atSpot.pnl)).toBe(true);
  });

  it('marks an expired leg at intrinsic and rejects a leg already in the past', () => {
    const [v] = valued([expiring]);
    expect(Number.isNaN(v.iv)).toBe(true);
    expect(legMark(v, 22700, 0, 1)).toBe(100);
    expect(legMark(v, 22500, 0, 1)).toBe(0);
    expect(nearestExpiryAverageIv([{ expiryDays: 0, iv: 0.12 }])).toBeCloseTo(0.12, 12);
    expect(computePayoff(inputs([leg({ expiryDays: -1 })]))).toBeNull();
  });

  it('a leg with time left still needs its own solved IV even next to an expiring leg', () => {
    const farLeg = leg({ id: 2, expiryDays: 7, strike: 22600, premium: 200 });
    expect(computePayoff(inputs([expiring, farLeg], { legIvs: {} }))).toBeNull();
  });
});
