import { describe, expect, it } from 'vitest';

import { FuturesQuote, futuresQuoteForExpiry, modelPriceForContract, resolveUnderlying, solveContractIv } from './contract-iv';

const EXPIRY = '2026-10-27';
const fut = (price: number, expiry = EXPIRY): FuturesQuote => ({ expiry, price });
const base = { side: 'call' as const, strike: 22600, expiry: EXPIRY, days: 6, close: 124.4, spot: 22600, futures: fut(22650) };

describe('resolveUnderlying', () => {
  const prices = (over: object = {}) => ({ spot: 22600, futures: fut(22650), optionExpiry: EXPIRY, ...over });

  it('refuses to guess when the instrument type is missing', () => {
    for (const kind of [null, undefined, '' as never, 'etf' as never]) {
      expect(resolveUnderlying(kind, prices())).toEqual({ ok: false, reason: 'missing-instrument-type' });
    }
  });

  it('uses the spot index value for an index, never the futures price', () => {
    expect(resolveUnderlying('index', prices())).toEqual({ ok: true, kind: 'index', underlying: 22600 });
    expect(resolveUnderlying('index', prices({ spot: null }))).toEqual({ ok: false, reason: 'missing-spot-price' });
    expect(resolveUnderlying('index', prices({ spot: 0 }))).toEqual({ ok: false, reason: 'missing-spot-price' });
  });

  it('uses the matching-expiry futures price for a stock, never spot', () => {
    expect(resolveUnderlying('stock', prices({ spot: 1190, futures: fut(1188.7) }))).toEqual({ ok: true, kind: 'stock', underlying: 1188.7 });
    for (const futures of [null, undefined, fut(0), fut(Number.NaN), fut(-5)]) {
      expect(resolveUnderlying('stock', prices({ spot: 1190, futures }))).toEqual({ ok: false, reason: 'missing-futures-price' });
    }
  });

  it('rejects a stock futures price that belongs to a different expiry, rather than using it', () => {
    expect(resolveUnderlying('stock', prices({ futures: fut(1195, '2026-11-24') }))).toEqual({ ok: false, reason: 'futures-expiry-mismatch' });
  });
});

describe('futuresQuoteForExpiry', () => {
  const futures = new Map([['2026-11-24', 1195], ['2026-12-29', 1200]]);

  it('returns only the quote of exactly the requested expiry, tagged with that expiry', () => {
    expect(futuresQuoteForExpiry(futures, '2026-11-24')).toEqual({ expiry: '2026-11-24', price: 1195 });
    expect(futuresQuoteForExpiry({ '2026-12-29': 1200 }, '2026-12-29')).toEqual({ expiry: '2026-12-29', price: 1200 });
  });

  it('never falls back to a different expiry', () => {
    expect(futuresQuoteForExpiry(futures, EXPIRY)).toBeNull(); // nearer expiry not listed
    expect(futuresQuoteForExpiry(futures, '2026-11-25')).toBeNull();
    expect(futuresQuoteForExpiry(null, EXPIRY)).toBeNull();
    expect(futuresQuoteForExpiry({ [EXPIRY]: 0 }, EXPIRY)).toBeNull();
  });
});

describe('solveContractIv: no invented volatility', () => {
  it('reports the missing instrument type', () => {
    expect(solveContractIv({ ...base, kind: null })).toEqual({ ok: false, reason: 'missing-instrument-type' });
  });

  it('a stock without its matching-expiry futures price has no IV, even though spot and another expiry exist', () => {
    const other = futuresQuoteForExpiry(new Map([['2026-11-24', 1195]]), EXPIRY);
    expect(solveContractIv({ ...base, kind: 'stock', spot: 1190, strike: 1190, close: 8.3, futures: other }))
      .toEqual({ ok: false, reason: 'missing-futures-price' });
  });

  it('a stock handed another expiry\'s futures price has no IV', () => {
    expect(solveContractIv({ ...base, kind: 'stock', spot: 1190, strike: 1190, close: 8.3, futures: fut(1195, '2026-11-24') }))
      .toEqual({ ok: false, reason: 'futures-expiry-mismatch' });
  });

  it('an index without a spot value has no IV even though a futures price exists', () => {
    expect(solveContractIv({ ...base, kind: 'index', spot: null })).toEqual({ ok: false, reason: 'missing-spot-price' });
  });

  it('reports a missing or zero close instead of using any other price', () => {
    for (const close of [null, undefined, 0, -1, Number.NaN]) {
      expect(solveContractIv({ ...base, kind: 'index', close })).toEqual({ ok: false, reason: 'missing-close-price' });
    }
  });

  it('has no IV without time to expiry or with an invalid strike', () => {
    for (const days of [0, -2, Number.NaN]) expect(solveContractIv({ ...base, kind: 'index', days })).toEqual({ ok: false, reason: 'no-time-to-expiry' });
    for (const strike of [0, -1, Number.NaN]) expect(solveContractIv({ ...base, kind: 'index', strike })).toEqual({ ok: false, reason: 'invalid-strike' });
  });

  it('rejects a close that no volatility can produce', () => {
    expect(solveContractIv({ ...base, kind: 'index', strike: 20000, close: 1 })).toEqual({ ok: false, reason: 'price-outside-bounds' }); // below intrinsic
    expect(solveContractIv({ ...base, kind: 'index', close: 30000 })).toEqual({ ok: false, reason: 'price-outside-bounds' }); // above the underlying
  });
});

describe('solveContractIv: approved inputs', () => {
  it('an index uses spot with 5.5 % / 1 %, ignores the futures price, and reproduces its price', () => {
    const result = solveContractIv({ ...base, kind: 'index' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.underlying).toBe(22600); // spot, not the 22650 futures
    expect(result.riskFreeRate).toBe(0.055);
    expect(result.dividendYield).toBe(0.01);
    expect(modelPriceForContract({ ...base, kind: 'index' }, result.ivPct)).toBeCloseTo(124.4, 5);
  });

  it('a stock uses the matching futures price with 0.01 % / 0 %, ignores spot, and reproduces its price', () => {
    const input = { ...base, kind: 'stock' as const, strike: 1190, close: 8.3, spot: 1190, futures: fut(1188.7) };
    const result = solveContractIv(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.underlying).toBe(1188.7);
    expect(result.riskFreeRate).toBe(0.0001);
    expect(result.dividendYield).toBe(0);
    expect(modelPriceForContract(input, result.ivPct)).toBeCloseTo(8.3, 5);
  });

  it('uses the contract\'s own close: a different close for the same contract gives a different IV', () => {
    const low = solveContractIv({ ...base, kind: 'index', close: 100 });
    const high = solveContractIv({ ...base, kind: 'index', close: 140 });
    expect(low.ok && high.ok).toBe(true);
    if (low.ok && high.ok) expect(high.ivPct).toBeGreaterThan(low.ivPct);
  });

  it('gives call and put their own IV at the same strike', () => {
    const call = solveContractIv({ ...base, kind: 'index', side: 'call', close: 124.4 });
    const put = solveContractIv({ ...base, kind: 'index', side: 'put', close: 150.7 });
    expect(call.ok && put.ok).toBe(true);
    if (call.ok && put.ok) expect(call.ivPct).not.toBeCloseTo(put.ivPct, 3);
  });

  it('the instrument type changes the answer for the same price (the parameters are really applied)', () => {
    const asIndex = solveContractIv({ ...base, kind: 'index', futures: fut(22600) });
    const asStock = solveContractIv({ ...base, kind: 'stock', futures: fut(22600) });
    expect(asIndex.ok && asStock.ok).toBe(true);
    if (asIndex.ok && asStock.ok) expect(asIndex.ivPct).not.toBeCloseTo(asStock.ivPct, 3);
  });

  it('reprices the option from the solved IV across strikes, sides, expiries and both instrument types', () => {
    let solved = 0;
    for (const kind of ['index', 'stock'] as const) {
      for (const side of ['call', 'put'] as const) {
        for (const strike of [0.9, 0.97, 1, 1.03, 1.12]) {
          for (const days of [1, 6, 30, 120]) {
            const spot = kind === 'index' ? 22600 : 1190;
            const input = { kind, side, strike: Math.round(spot * strike), expiry: EXPIRY, days, spot, futures: fut(spot * 1.002) };
            const price = modelPriceForContract(input, 21.5)!;
            const result = solveContractIv({ ...input, close: price });
            if (!result.ok) continue; // deep contracts whose price carries no volatility information
            solved += 1;
            expect(modelPriceForContract(input, result.ivPct)).toBeCloseTo(price, 5);
          }
        }
      }
    }
    expect(solved).toBeGreaterThan(60);
  });
});
