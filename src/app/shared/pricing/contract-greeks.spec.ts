import { describe, expect, it } from 'vitest';

import { contractGreeks } from './contract-greeks';
import { bsPrice } from './option-pricing';

const index = { underlying: 22600, riskFreeRate: 0.055, dividendYield: 0.01 };
const stock = { underlying: 1200.5, riskFreeRate: 0.0001, dividendYield: 0 };

describe('contractGreeks', () => {
  it('solves the IV from the contract\'s own close and evaluates the Greeks at that IV', () => {
    const close = bsPrice('call', 22600, 22900, 0.055, 0.01, 6 / 365, 0.17);
    const result = contractGreeks(index, { side: 'call', strike: 22900, days: 6, close });
    expect(result.failure).toBeUndefined();
    expect(result.ivPct).toBeCloseTo(17, 4);
    // Same numbers as the shared Greeks golden values recorded for sigma 0.17.
    expect(result.delta).toBeCloseTo(0.2876306446616175, 5);
    expect(result.gamma).toBeCloseTo(0.000692166693601037, 8);
    expect(result.theta).toBeCloseTo(-14.784182938923054, 4);
    expect(result.vega).toBeCloseTo(9.879498126907919, 4);
  });

  it('gives a put its own IV, delta and theta (call and put are not the same number)', () => {
    const callClose = bsPrice('call', 22600, 22600, 0.055, 0.01, 6 / 365, 0.15);
    const putClose = bsPrice('put', 22600, 22600, 0.055, 0.01, 6 / 365, 0.19);
    const call = contractGreeks(index, { side: 'call', strike: 22600, days: 6, close: callClose });
    const put = contractGreeks(index, { side: 'put', strike: 22600, days: 6, close: putClose });
    expect(call.ivPct).toBeCloseTo(15, 4);
    expect(put.ivPct).toBeCloseTo(19, 4);
    expect(call.delta!).toBeGreaterThan(0);
    expect(put.delta!).toBeLessThan(0);
  });

  it('uses the approved stock inputs when handed them', () => {
    const close = bsPrice('call', 1200.5, 1190, 0.0001, 0, 30 / 365, 0.25);
    expect(contractGreeks(stock, { side: 'call', strike: 1190, days: 30, close }).ivPct).toBeCloseTo(25, 4);
  });

  it('has no IV or Greeks on expiry day, for a missing close, or for a price no volatility can produce', () => {
    const none = { ivPct: null, delta: null, gamma: null, theta: null, vega: null, rho: null };
    expect(contractGreeks(index, { side: 'call', strike: 22600, days: 0, close: 100 })).toEqual({ ...none, failure: 'no-time-to-expiry' });
    expect(contractGreeks(index, { side: 'call', strike: 22600, days: 6, close: 0 })).toEqual({ ...none, failure: 'missing-close-price' });
    expect(contractGreeks(index, { side: 'call', strike: 22600, days: 6, close: null })).toEqual({ ...none, failure: 'missing-close-price' });
    expect(contractGreeks(index, { side: 'call', strike: 20000, days: 6, close: 1 })).toEqual({ ...none, failure: 'price-outside-bounds' });
  });
});
