import { describe, expect, it } from 'vitest';

import { atmImpliedVolatility } from './atm-iv';
import { bsPrice } from './option-pricing';

const INPUTS = { underlying: 22600, riskFreeRate: 0.055, dividendYield: 0.01 };
const DAYS = 6;
const close = (side: 'call' | 'put', strike: number, vol: number) => bsPrice(side, 22600, strike, 0.055, 0.01, DAYS / 365, vol);
const row = (strike: number, callVol: number, putVol: number) => ({ strike, callClose: close('call', strike, callVol), putClose: close('put', strike, putVol) });

describe('atmImpliedVolatility', () => {
  it('uses the strike nearest the underlying and averages the call and put IV solved from their own closes', () => {
    const atm = atmImpliedVolatility(INPUTS, [row(22500, 0.2, 0.2), row(22600, 0.15, 0.19), row(22700, 0.3, 0.3)], DAYS)!;
    expect(atm.strike).toBe(22600);
    expect(atm.callPct).toBeCloseTo(15, 3);
    expect(atm.putPct).toBeCloseTo(19, 3);
    expect(atm.averagePct).toBeCloseTo(17, 3);
  });

  it('breaks a distance tie towards the lower strike', () => {
    expect(atmImpliedVolatility({ ...INPUTS, underlying: 22650 }, [row(22700, 0.2, 0.2), row(22600, 0.1, 0.1)], DAYS)!.strike).toBe(22600);
  });

  it('moves to the next nearest strike when the nearest has no usable close, and averages only the sides that solve', () => {
    const atm = atmImpliedVolatility(INPUTS, [{ strike: 22600, callClose: 0, putClose: null }, { strike: 22650, callClose: close('call', 22650, 0.18), putClose: 0 }], DAYS)!;
    expect(atm.strike).toBe(22650);
    expect(atm.putPct).toBeNull();
    expect(atm.averagePct).toBeCloseTo(18, 3);
  });

  it('is null, not a made-up number, with no rows, no usable closes or no time to expiry', () => {
    expect(atmImpliedVolatility(INPUTS, [], DAYS)).toBeNull();
    expect(atmImpliedVolatility(INPUTS, [{ strike: 22600, callClose: 0, putClose: 0 }], DAYS)).toBeNull();
    expect(atmImpliedVolatility(INPUTS, [row(22600, 0.15, 0.15)], 0)).toBeNull();
    expect(atmImpliedVolatility(INPUTS, [{ strike: Number.NaN, callClose: 100, putClose: 100 }], DAYS)).toBeNull();
  });

  it('uses the underlying it is given: a stock\'s futures close moves the at-the-money strike', () => {
    const rows = [row(22600, 0.15, 0.15), row(22900, 0.2, 0.2)];
    expect(atmImpliedVolatility({ ...INPUTS, underlying: 22850 }, rows, DAYS)!.strike).toBe(22900);
  });
});
