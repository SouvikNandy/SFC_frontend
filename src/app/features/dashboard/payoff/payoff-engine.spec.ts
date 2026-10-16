import { computePayoff, evaluatePosition } from './payoff-engine';
import { DAYS_YEAR, ValuedLeg, bsValue, chainIV, intrinsic, legMark, nearestExpiryAverageIv, valueLegs } from './payoff-pricing';
import { STRATEGY_NAMES, StrategyContext, buildStrategy } from './payoff-strategies';
import { PayoffInputs, PayoffStrategy, PricedLeg } from './payoff.model';

const SPOT = 22630;
const REF_VOL = 12.5;
const LOT = 75;

/** Reference implementation of the approved formula (independent of the code under test). */
function chainIvReference(spot: number, strike: number, basePct: number, live: boolean): number {
  const m = Math.log(strike / spot);
  const adj = Math.max(-0.45, Math.min(1.2, -2.0 * m + 25.0 * m * m));
  const iv = (basePct / 100) * (1 + adj);
  return live ? iv * 1.03 : iv;
}

/** A quoted premium that deliberately does NOT equal the model value, like a real BhavCopy settlement. */
const quotedPremium = (type: 'call' | 'put', strike: number, days: number) =>
  Math.round((bsValue(type, SPOT, strike, 0, 0, days / DAYS_YEAR, chainIV(SPOT, strike, REF_VOL) * 1.13) + 0.4) * 100) / 100;

function presetLegs(strategy: PayoffStrategy): PricedLeg[] {
  let id = 0;
  const ctx: StrategyContext = {
    spot: SPOT, step: 50, lotSize: LOT, sigma: REF_VOL / 100, expiries: [16, 23], existing: [],
    premium: quotedPremium, strike: target => target, nextId: () => ++id,
  };
  return buildStrategy(strategy, ctx) as PricedLeg[];
}

const leg = (over: Partial<PricedLeg>): PricedLeg => ({
  id: 1, type: 'call', direction: 'long', strike: 22600, premium: 150, quantity: 1, expiryDays: 16, lotSize: LOT, ...over,
});

const inputs = (legs: PricedLeg[], over: Partial<PayoffInputs> = {}): PayoffInputs => ({
  legs, spot: SPOT, referenceVol: REF_VOL, live: false, ivMultiplier: 100, rangePct: 6, evalDay: 0,
  baseDate: new Date(2026, 9, 15), narrow: false, ...over,
});

describe('chainIV (approved formula)', () => {
  it.each([22630, 22000, 22600, 23500, 20000, 30000])('matches the formula at strike %s', strike => {
    expect(chainIV(SPOT, strike, REF_VOL)).toBeCloseTo(chainIvReference(SPOT, strike, REF_VOL, false), 12);
  });

  it('equals the reference vol at the money and applies the live uplift', () => {
    expect(chainIV(SPOT, SPOT, REF_VOL)).toBeCloseTo(0.125, 12);
    expect(chainIV(SPOT, 22000, REF_VOL, true)).toBeCloseTo(chainIvReference(SPOT, 22000, REF_VOL, true), 12);
  });

  it('keeps the skew adjustment inside its bounds', () => {
    expect(chainIV(SPOT, SPOT * 3, REF_VOL)).toBeCloseTo(0.125 * 2.2, 12);
    expect(chainIV(SPOT, SPOT * 0.5, REF_VOL)).toBeGreaterThan(0);
  });

  it('returns NaN, never a substitute value, for invalid inputs', () => {
    expect(chainIV(SPOT, 22600, Number.NaN)).toBeNaN();
    expect(chainIV(SPOT, 22600, 0)).toBeNaN();
    expect(chainIV(0, 22600, REF_VOL)).toBeNaN();
    expect(chainIV(SPOT, -1, REF_VOL)).toBeNaN();
  });
});

describe('per-leg IV', () => {
  const legs = [leg({ id: 1, strike: 22200 }), leg({ id: 2, strike: 22600 }), leg({ id: 3, strike: 23000, expiryDays: 23 })];

  it('stores a distinct IV per leg from its own strike', () => {
    const valued = valueLegs(legs, SPOT, REF_VOL);
    expect(valued.map(l => l.iv)).toEqual(legs.map(l => chainIV(SPOT, l.strike, REF_VOL)));
    expect(new Set(valued.map(l => l.iv)).size).toBe(3);
  });

  it('changing one leg does not alter another leg IV', () => {
    const before = valueLegs(legs, SPOT, REF_VOL);
    const after = valueLegs([legs[0], { ...legs[1], strike: 22900, premium: 40 }, legs[2]], SPOT, REF_VOL);
    expect(after[0].iv).toBe(before[0].iv);
    expect(after[2].iv).toBe(before[2].iv);
    expect(after[1].iv).not.toBe(before[1].iv);
  });

  it('recomputes when spot or the reference volatility changes', () => {
    const base = valueLegs(legs, SPOT, REF_VOL)[0].iv;
    expect(valueLegs(legs, SPOT * 1.02, REF_VOL)[0].iv).not.toBe(base);
    expect(valueLegs(legs, SPOT, REF_VOL * 2)[0].iv).toBeCloseTo(base * 2, 12);
  });

  it('averages only the nearest-expiry legs (unweighted)', () => {
    const valued = valueLegs(legs, SPOT, REF_VOL);
    expect(nearestExpiryAverageIv(valued)).toBeCloseTo((valued[0].iv + valued[1].iv) / 2, 12);
    expect(nearestExpiryAverageIv([])).toBeNaN();
  });

  it('applies the multiplier to every leg when valuing', () => {
    const [first] = valueLegs([leg({ strike: 22400 })], SPOT, REF_VOL);
    const expected = (m: number) =>
      Math.max(bsValue('call', SPOT, 22400, 0, 0, 16 / DAYS_YEAR, first.iv * m) + first.entryOffset, 0);
    expect(legMark(first, SPOT, 0, 1.5)).toBeCloseTo(expected(1.5), 9);
    expect(legMark(first, SPOT, 0, 1.5)).toBeGreaterThan(legMark(first, SPOT, 0, 1));
  });
});

describe('computePayoff: IV label and probability inputs', () => {
  const legs = [leg({ id: 1, strike: 22400, premium: 300 }), leg({ id: 2, strike: 22800, premium: 90 }),
    leg({ id: 3, strike: 22600, premium: 210, expiryDays: 23 })];

  it('effVol is the nearest-expiry average IV x multiplier', () => {
    const valued = valueLegs(legs, SPOT, REF_VOL);
    const avg = (valued[0].iv + valued[1].iv) / 2;
    expect(computePayoff(inputs(legs, { ivMultiplier: 150 }))!.effVol).toBeCloseTo(avg * 1.5 * 100, 9);
    expect(computePayoff(inputs(legs, { ivMultiplier: 100 }))!.effVol).toBeCloseTo(avg * 100, 9);
  });

  it('is unaffected by a farther-expiry leg, but follows the nearest legs', () => {
    const without = computePayoff(inputs(legs.slice(0, 2)))!;
    const withFar = computePayoff(inputs(legs))!;
    expect(withFar.effVol).toBeCloseTo(without.effVol, 9);
    const moved = computePayoff(inputs([{ ...legs[0], strike: 21800 }, legs[1]]))!;
    expect(moved.effVol).not.toBeCloseTo(without.effVol, 3);
  });

  it('chance of profit stays within 0-100 and responds to the multiplier', () => {
    const low = computePayoff(inputs(legs, { ivMultiplier: 60 }))!.metrics.chanceOfProfit;
    const high = computePayoff(inputs(legs, { ivMultiplier: 200 }))!.metrics.chanceOfProfit;
    [low, high].forEach(v => { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(100); });
    expect(low).not.toBeCloseTo(high, 3);
  });

  it('returns null instead of NaN for empty or unpriceable positions', () => {
    expect(computePayoff(inputs([]))).toBeNull();
    expect(computePayoff(inputs(legs, { referenceVol: Number.NaN }))).toBeNull();
    expect(computePayoff(inputs(legs, { spot: 0 }))).toBeNull();
  });

  it('produces only finite chart values', () => {
    const result = computePayoff(inputs(legs, { evalDay: 0 }))!;
    const values = [...result.curveEval, ...result.curveExpiry].flatMap(p => [p.price, p.pnl]);
    expect(values.every(Number.isFinite)).toBe(true);
    expect(result.densities.every(Number.isFinite)).toBe(true);
    expect(result.heatmap.rows.every(r => r.cells.every(c => Number.isFinite(c.pnl)))).toBe(true);
  });
});

describe('T+0 invariant: P&L is zero at entry spot for every strategy', () => {
  const strategies = (Object.keys(STRATEGY_NAMES) as PayoffStrategy[]).filter(name => name !== 'custom_position');

  it.each(strategies)('%s', strategy => {
    const legs = presetLegs(strategy);
    expect(legs.length).toBeGreaterThan(0);
    const valued = valueLegs(legs, SPOT, REF_VOL);
    expect(evaluatePosition(valued, SPOT, 0, 1)).toBeCloseTo(0, 6);
    // Quoted premiums differ from the model, so the calibration (not the IV alone) delivers this.
    expect(valued.some(l => Math.abs(l.entryOffset) > 1e-6)).toBe(true);
  });

  it('holds for a custom multi-leg position with short legs and quantities', () => {
    const legs = [leg({ id: 1, direction: 'short', strike: 22700, premium: 120, quantity: 3 }),
      leg({ id: 2, type: 'put', strike: 22300, premium: 75, quantity: 2, expiryDays: 23 }),
      leg({ id: 3, type: 'put', direction: 'short', strike: 22500, premium: 140, expiryDays: 9 })];
    expect(evaluatePosition(valueLegs(legs, SPOT, REF_VOL), SPOT, 0, 1)).toBeCloseTo(0, 6);
  });

  it('computePayoff starts at T+0 when asked for evalDay 0', () => {
    const result = computePayoff(inputs(presetLegs('double_calendar'), { evalDay: 0 }))!;
    expect(result.evalDay).toBe(0);
    expect(result.curveEval.every(p => Number.isFinite(p.pnl))).toBe(true);
  });

  it('a multiplier other than x1.00 legitimately moves T+0 P&L (vol shock)', () => {
    const valued = valueLegs(presetLegs('long_straddle'), SPOT, REF_VOL);
    expect(evaluatePosition(valued, SPOT, 0, 1.5)).toBeGreaterThan(0);
  });
});

describe('expiry accounting, signs, quantity and lot', () => {
  it('a leg is worth intrinsic at expiry; P&L = (intrinsic - premium) x qty x lot', () => {
    const valued = valueLegs([leg({ strike: 22600, premium: 150, quantity: 2 })], SPOT, REF_VOL);
    for (const spot of [21500, 22600, 23400]) {
      expect(evaluatePosition(valued, spot, 16, 1)).toBeCloseTo((intrinsic('call', spot, 22600) - 150) * 2 * LOT, 9);
    }
  });

  it('long and short legs have opposite P&L; quantity and lot scale exactly once', () => {
    const long = valueLegs([leg({ quantity: 1 })], SPOT, REF_VOL);
    const short = valueLegs([leg({ direction: 'short', quantity: 1 })], SPOT, REF_VOL);
    const triple = valueLegs([leg({ quantity: 3 })], SPOT, REF_VOL);
    for (const day of [0, 8, 16]) {
      expect(evaluatePosition(short, 22900, day, 1)).toBeCloseTo(-evaluatePosition(long, 22900, day, 1), 9);
      expect(evaluatePosition(triple, 22900, day, 1)).toBeCloseTo(3 * evaluatePosition(long, 22900, day, 1), 9);
    }
    const bigLot = valueLegs([leg({ lotSize: 150 })], SPOT, REF_VOL);
    expect(evaluatePosition(bigLot, 22900, 8, 1)).toBeCloseTo(2 * evaluatePosition(long, 22900, 8, 1), 9);
  });

  it('calibration fades out: no artificial offset remains at expiry', () => {
    const [valued] = valueLegs([leg({ premium: 400 })], SPOT, REF_VOL);
    expect(Math.abs(valued.entryOffset)).toBeGreaterThan(1);
    expect(legMark(valued, 23000, 16, 1)).toBeCloseTo(intrinsic('call', 23000, 22600), 12);
    expect(legMark(valued, 23000, 20, 1)).toBeCloseTo(intrinsic('call', 23000, 22600), 12);
  });

  it('mixed expiries: each leg uses its own remaining time; premium accounting unchanged', () => {
    const legs = [leg({ id: 1, direction: 'short', premium: 150, expiryDays: 16 }), leg({ id: 2, premium: 220, expiryDays: 23 })];
    const valued: ValuedLeg[] = valueLegs(legs, SPOT, REF_VOL);
    const [near, far] = valued;
    // At the near expiry the far leg still has 7 days of time value, the near leg is intrinsic.
    expect(legMark(near, SPOT, 16, 1)).toBeCloseTo(intrinsic('call', SPOT, 22600), 12);
    const farMark = legMark(far, SPOT, 16, 1);
    expect(farMark).toBeGreaterThan(intrinsic('call', SPOT, 22600));
    const direct = Math.max(bsValue('call', SPOT, 22600, 0, 0, 7 / DAYS_YEAR, far.iv) + far.entryOffset * (7 / 23), 0);
    expect(farMark).toBeCloseTo(direct, 9);
    const result = computePayoff(inputs(legs))!;
    expect(result.metrics.netPremium).toBeCloseTo((-150 + 220) * LOT, 9);
    expect(result.isCalendar).toBe(true);
  });
});
