import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastService } from '../../core/services/toast.service';
import { GreeksComponent } from './greeks/greeks.component';
import { GreeksCalculatorService } from './greeks/greeks-calculator.service';
import { HistoricalVolatilityComponent } from './historical-volatility/historical-volatility.component';
import { HistoricalVolatilityService } from './historical-volatility/historical-volatility.service';
import { ImpliedVolatilityComponent } from './implied-volatility/implied-volatility.component';
import { LiveDataAccessService } from './live-data/live-data-access.service';
import { OptionsChainComponent } from './options-chain/options-chain.component';
import { PayoffComponent } from './payoff/payoff.component';
import { PayoffService } from './payoff/payoff.service';
import { ProbabilityComponent } from './probability/probability.component';

/*
 * Notification UX across the tools (2026-11-05): a failure that leaves the screen unusable stays visible as an inline error with Retry
 * (role="alert") and is not repeated as a toast; a normal data condition is a neutral note (role="status"), never an error.
 */
describe('notification UX across the tools', () => {
  let symbolsFail: boolean;
  let toastError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    symbolsFail = true;
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }));
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: LiveDataAccessService, useValue: { requestedLive: () => false, access: () => 'locked' } },
      ],
    });
    vi.spyOn(TestBed.inject(GreeksCalculatorService), 'getSymbols').mockImplementation(() => (symbolsFail ? throwError(() => new Error('boom')) : of(['NIFTY'])));
    toastError = vi.spyOn(TestBed.inject(ToastService), 'error');
  });

  afterEach(() => vi.unstubAllGlobals());

  const screens: Array<[string, Type<unknown>]> = [
    ['Greeks', GreeksComponent],
    ['Implied Volatility', ImpliedVolatilityComponent],
    ['Probability', ProbabilityComponent],
    ['Options Chain', OptionsChainComponent],
    ['Payoff', PayoffComponent],
    ['Historical Volatility', HistoricalVolatilityComponent],
  ];

  for (const [name, component] of screens) {
    it(`${name}: a failed symbol list is a persistent error with Retry, not a toast, and Retry loads the list`, async () => {
      const fixture = TestBed.createComponent(component);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      const host = fixture.nativeElement as HTMLElement;
      const error = Array.from(host.querySelectorAll('.inline-error')).find(el => el.textContent?.includes('Unable to load the symbol list.'));
      expect(error, name).toBeTruthy();
      expect(error!.getAttribute('role')).toBe('alert');
      expect(toastError).not.toHaveBeenCalled();
      symbolsFail = false;
      error!.querySelector<HTMLButtonElement>('.inline-retry')!.click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(Array.from(host.querySelectorAll('.inline-error')).some(el => el.textContent?.includes('Unable to load the symbol list.'))).toBe(false);
    });
  }

  it('Historical Volatility: no data for the symbol and date is a neutral note, not an error or toast', async () => {
    symbolsFail = false;
    vi.spyOn(TestBed.inject(HistoricalVolatilityService), 'calculate').mockReturnValue(of([]));
    const fixture = TestBed.createComponent(HistoricalVolatilityComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const component = fixture.componentInstance;
    component.symbolControl.setValue('NIFTY');
    component.calculate();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const note = host.querySelector('.inline-note');
    expect(note?.textContent).toContain('No historical volatility data is available');
    expect(note?.getAttribute('role')).toBe('status');
    expect(host.querySelector('.inline-error, .input-error')).toBeNull();
    expect(toastError).not.toHaveBeenCalled();
  });

  describe('Payoff market data', () => {
    const open = async (details: () => Observable<unknown>) => {
      symbolsFail = false;
      vi.spyOn(TestBed.inject(PayoffService), 'getSymbolDetails').mockImplementation(details as never);
      const fixture = TestBed.createComponent(PayoffComponent);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      return { fixture, host: fixture.nativeElement as HTMLElement };
    };

    it('an instrument without an underlying price is a neutral note, not an error or toast', async () => {
      const { host } = await open(() => of({ symbol: 'NIFTY', trade_date: '2026-10-30', expiry_date: ['2026-11-03'], underlying: 0, strike: [], atm_strike: 0, hv20: 0, lot: 75 }));
      const note = host.querySelector('.inline-note');
      expect(note?.textContent).toContain('Underlying price is not available for NIFTY.');
      expect(note?.getAttribute('role')).toBe('status');
      expect(Array.from(host.querySelectorAll('.inline-error, .input-error')).some(el => el.textContent?.includes('Underlying price'))).toBe(false);
      expect(toastError).not.toHaveBeenCalled();
    });

    it('a failed load is an error with Retry shown once (not also as a toast or a validation message)', async () => {
      let fail = true;
      const { fixture, host } = await open(() => (fail ? throwError(() => new Error('boom')) : of({ symbol: 'NIFTY', trade_date: '2026-10-30', expiry_date: [], underlying: 22600, strike: [], atm_strike: 0, hv20: 0, lot: 75 })));
      const errors = Array.from(host.querySelectorAll('.inline-error, .input-error')).filter(el => el.textContent?.includes('Unable to load payoff data for NIFTY.'));
      expect(errors).toHaveLength(1);
      expect(errors[0].getAttribute('role')).toBe('alert');
      expect(toastError).not.toHaveBeenCalled();
      fail = false;
      errors[0].querySelector<HTMLButtonElement>('.inline-retry')!.click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(host.textContent).not.toContain('Unable to load payoff data');
      expect(host.querySelector('.inline-note')?.textContent).toContain('No current or upcoming expiries are available for NIFTY.');   // the retried answer is a data condition
    });
  });
});
