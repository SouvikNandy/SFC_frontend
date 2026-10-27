import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, expect, it } from 'vitest';

import { ProbabilityService } from './probability.service';

describe('ProbabilityService (shared frontend calculation)', () => {
  const service = () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    return TestBed.inject(ProbabilityService);
  };

  it('reproduces the backend result for the same inputs (values recorded from POST /tools/probability on 24 Oct 2026)', () => {
    // NIFTY spot 22600 → target 23000 in 4 days at HV-20 16.989993 %, rate 0, dividend 0, 365-day year.
    const { inputs, results, charts } = service().calculate({ symbol: 'NIFTY', spot: 22600, target: 23000, expiry: 4, vol: 16.989993 });
    expect(inputs).toMatchObject({ spot: 22600, target: 23000, vol: 16.989993, expiry: 4, rate: 0, dividend: 0, day_count: 365, symbol: 'NIFTY' });
    expect(results.direction).toBe('above');
    expect(results.probTouchPct).toBeCloseTo(32.11, 1);
    expect(results.probExpireAbovePct).toBeCloseTo(15.98, 1);
    expect(results.probExpireBelowPct).toBeCloseTo(84.02, 1);
    expect(results.d2).toBeCloseTo(-0.995308, 4);
    expect(results.logDrift).toBeCloseTo(-0.01443299, 7);
    expect(results.timeYears).toBeCloseTo(0.010959, 6);
    expect(results.oneSdUpper).toBeCloseTo(23005.56, 0);
    expect(results.oneSdLower).toBeCloseTo(22201.59, 0);
    expect(results.movePct).toBeCloseTo(1.77, 2);
    expect(results.moveSd).toBeCloseTo(0.9864, 3);
    expect(charts?.curve?.length).toBe(161);
  });

  it('honours the volatility it is given (the backend endpoint ignores it)', () => {
    const calculator = service();
    const low = calculator.calculate({ symbol: 'NIFTY', spot: 22600, target: 23000, expiry: 4, vol: 10 });
    const high = calculator.calculate({ symbol: 'NIFTY', spot: 22600, target: 23000, expiry: 4, vol: 40 });
    expect(high.results.probTouchPct).toBeGreaterThan(low.results.probTouchPct);
    expect(high.inputs.vol).toBe(40);
  });

  it('refuses zero days, zero volatility or non-positive prices instead of returning NaN', () => {
    const calculator = service();
    const ok = { symbol: 'NIFTY', spot: 22600, target: 23000, expiry: 4, vol: 17 };
    for (const bad of [{ expiry: 0 }, { vol: 0 }, { spot: 0 }, { target: -1 }]) {
      expect(() => calculator.calculate({ ...ok, ...bad })).toThrow();
    }
  });

  it('sends no request to the backend', () => {
    const calculator = service();
    calculator.calculate({ symbol: 'NIFTY', spot: 22600, target: 22000, expiry: 4, vol: 17 });
    TestBed.inject(HttpTestingController).verify();
  });
});
