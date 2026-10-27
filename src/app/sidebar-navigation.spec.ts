import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { routes } from './app.routes';
import { atmImpliedVolatility } from './shared/pricing/atm-iv';
import { GreeksComponent } from './features/dashboard/greeks/greeks.component';
import { ImpliedVolatilityComponent } from './features/dashboard/implied-volatility/implied-volatility.component';
import { ProbabilityComponent } from './features/dashboard/probability/probability.component';

/*
 * Requirement 4, end to end through the real routes and real services (only HTTP is faked): the first tool opened
 * loads the symbol list; every tool opened afterwards gets that list from the session cache synchronously, which is
 * exactly the case that used to leave Probability, Implied Volatility and Greeks empty after sidebar navigation.
 */
const DETAILS = {
  symbol: 'NIFTY', trade_date: '2026-10-23', expiry_date: ['2026-10-27', '2026-11-03'], underlying: 22600,
  strike: [22500, 22600, 22700], atm_strike: 22600, hv20: 17, lot: 65, market_price: { CE: 132.45, PE: 137.65 },
};
const CHAIN = {
  success: true,
  data: {
    '22500': { strike_price: 22500, underlying_price: 22600, c_oi: 1, c_oi_chg: 0, c_vol: 1, c_ltp: 190.5, p_oi: 1, p_oi_chg: 0, p_vol: 1, p_ltp: 95.1 },
    '22600': { strike_price: 22600, underlying_price: 22600, c_oi: 1, c_oi_chg: 0, c_vol: 1, c_ltp: 124.4, p_oi: 1, p_oi_chg: 0, p_vol: 1, p_ltp: 150.7 },
    '22700': { strike_price: 22700, underlying_price: 22600, c_oi: 1, c_oi_chg: 0, c_vol: 1, c_ltp: 70.2, p_oi: 1, p_oi_chg: 0, p_vol: 1, p_ltp: 210.9 },
  },
};

describe('opening tools from the sidebar', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;

  const pending = (suffix: string): TestRequest[] => http.match((request) => request.url.endsWith(suffix));
  const settle = async () => {
    harness.fixture.detectChanges();
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
  };
  const component = <T>(type: Type<T>): T => (harness.fixture as ComponentFixture<unknown>).debugElement.query(By.directive(type)).componentInstance as T;
  let kindRequests = 0;
  /** Answers whatever the layout and the opened tool request, like the real API would. Returns how many symbol-list requests were made. */
  const answerApi = async (): Promise<number> => {
    let symbolListRequests = 0;
    for (let round = 0; round < 3; round++) {
      pending('/fo/ticker').forEach((request) => request.flush({ success: true, data: [] }));
      const kinds = pending('/fo/dd_list_v2');
      kindRequests += kinds.length;
      kinds.forEach((request) => request.flush({ success: true, data: { NIFTY: 'INDEX', RELIANCE: 'STOCK' } }));
      const lists = pending('/fo/dd_list');
      symbolListRequests += lists.length;
      lists.forEach((request) => request.flush({ success: true, data: ['NIFTY'] }));
      pending('/fo/dd_symbol_details').forEach((request) => request.flush({ success: true, data: DETAILS }));
      pending('/tools/options-chain').forEach((request) => request.flush(CHAIN));
      await settle();
    }
    return symbolListRequests;
  };

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-24T06:00:00Z')); // 24 Oct 2026, IST
    kindRequests = 0;
    TestBed.configureTestingModule({ providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => vi.useRealTimers());

  it('Greeks, then Probability, then Implied Volatility each show data on first open, from the cached symbol list', async () => {
    // First tool opened: the symbol list is fetched.
    await harness.navigateByUrl('/greeks');
    expect(await answerApi()).toBe(1);
    const greeks = component(GreeksComponent);
    expect(greeks.form.value.sourceMode).toBe('eod');
    expect(greeks.form.value.strike).toBe(22600); // ATM strike pre-filled
    expect(greeks.form.value.ivPrice).toBe(124.4); // Close (EOD) of the 22600 call, not the 132.45 LTP
    expect(greeks.form.value.expiry).toBe(3); // IST 24 Oct -> 27 Oct

    // Probability: the list is now cached, so no dd_list request; the details must still load.
    await harness.navigateByUrl('/probability');
    expect(await answerApi()).toBe(0);
    const probability = component(ProbabilityComponent);
    expect(probability.symbolDetails?.symbol).toBe('NIFTY');
    expect(probability.spotControl.value).toBe(22600);
    expect(probability.expiryControl.value).toBe(3);
    // The volatility is the at-the-money implied volatility of the chain closes (index: spot 22600, 5.5 % / 1 %), never HV-20 (17).
    const atm = atmImpliedVolatility({ underlying: 22600, riskFreeRate: 0.055, dividendYield: 0.01 }, [
      { strike: 22500, callClose: 190.5, putClose: 95.1 }, { strike: 22600, callClose: 124.4, putClose: 150.7 }, { strike: 22700, callClose: 70.2, putClose: 210.9 },
    ], 3)!;
    expect(probability.volControl.value).toBeCloseTo(atm.averagePct, 1);
    expect(probability.volControl.value).not.toBe(17);

    // Implied Volatility: same, with its price taken from the chain close.
    await harness.navigateByUrl('/implied-volatility');
    expect(await answerApi()).toBe(0);
    const iv = component(ImpliedVolatilityComponent);
    expect(iv.symbolDetails?.symbol).toBe('NIFTY');
    expect(iv.underlyingControl.value).toBe(22600);
    expect(iv.strikeControl.value).toBe(22600);
    expect(iv.marketPriceControl.value).toBe(124.4);
    expect(iv.result?.ok).toBe(true);
    expect(kindRequests).toBe(1); // the instrument classification is fetched once and shared by every tool
    http.verify();
  }, 30000);

  it('opening Probability first and Greeks second works the same way', async () => {
    await harness.navigateByUrl('/probability');
    await answerApi();
    expect(component(ProbabilityComponent).spotControl.value).toBe(22600);

    await harness.navigateByUrl('/greeks');
    expect(await answerApi()).toBe(0);
    const greeks = component(GreeksComponent);
    expect(greeks.form.value.strike).toBe(22600);
    expect(greeks.form.value.ivPrice).toBe(124.4);
    expect(greeks.symbolDetails?.symbol).toBe('NIFTY');
  }, 30000);
});
