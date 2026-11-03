import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { Observable, Subject, of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastService } from '../../core/services/toast.service';
import { PricingContext, PricingContextService } from '../../shared/pricing/pricing-context.service';
import { GreeksComponent } from './greeks/greeks.component';
import { GreeksCalculatorService } from './greeks/greeks-calculator.service';
import { GreeksSymbolDetails } from './greeks/greeks.model';
import { ImpliedVolatilityComponent } from './implied-volatility/implied-volatility.component';
import { LiveDataAccessService } from './live-data/live-data-access.service';
import { OptionsChainComponent } from './options-chain/options-chain.component';
import { OptionsChainRow, OptionsChainViewModel } from './options-chain/models/chain.model';
import { OptionsChainService } from './options-chain/options-chain.service';
import { ProbabilityComponent } from './probability/probability.component';

/*
 * Regressions for stale state across symbol switches, failed loads and re-rendered dropdowns (bug-closure review,
 * 2026-11-03). Every request is a Subject the test answers by hand, so late and out-of-order responses can be replayed.
 */
const details = (symbol: string, over: Partial<GreeksSymbolDetails> = {}): GreeksSymbolDetails => ({
  symbol,
  trade_date: '2026-10-30',
  expiry_date: symbol === 'NIFTY' ? ['2026-11-03', '2026-11-09'] : ['2026-11-23', '2026-12-29'],
  underlying: symbol === 'NIFTY' ? 25000 : 1400,
  // The ATM strike is deliberately NOT the first listed strike.
  strike: symbol === 'NIFTY' ? [24900, 25000, 25100] : [1380, 1400, 1420],
  atm_strike: symbol === 'NIFTY' ? 25000 : 1400,
  hv20: 14,
  ...over,
});
const side = (ltp: number) => ({ oi: 0, oiChange: 0, volume: 0, iv: 0, ltp, ltpChange: 0, delta: null, gamma: null, theta: null, vega: null, itm: false });
const chain = (strike: number, call: number, put: number): OptionsChainViewModel => ({
  spot: strike, spotChange: null, spotChangePercent: null, pcr: null, maxPain: null, callOi: null, putOi: null, atmIv: null,
  rows: [{ strike, call: side(call), put: side(put) }] as OptionsChainRow[],
  chart: { callOi: [], putOi: [], callIv: [], putIv: [] },
});
const context = (underlying: number): PricingContext => ({ ok: true, kind: 'index', underlying, riskFreeRate: 0.055, dividendYield: 0.01, futures: null });

describe('symbol switches, failed loads and dropdowns keep no stale state', () => {
  let detailCalls: Array<{ symbol: string; reply: Subject<GreeksSymbolDetails> }>;
  let chainCalls: Array<{ request: { symbol: string; expiry: string }; reply: Subject<OptionsChainViewModel> }>;

  const answerDetails = (symbol: string, over: Partial<GreeksSymbolDetails> = {}) => {
    const call = [...detailCalls].reverse().find(c => c.symbol === symbol)!;
    call.reply.next(details(symbol, over));
    call.reply.complete();
  };
  const failDetails = (symbol: string) => [...detailCalls].reverse().find(c => c.symbol === symbol)!.reply.error(new Error('HTTP 500'));
  const answerChain = (symbol: string, value: OptionsChainViewModel) => {
    const call = [...chainCalls].reverse().find(c => c.request.symbol === symbol)!;
    call.reply.next(value);
    call.reply.complete();
  };

  beforeEach(() => {
    detailCalls = [];
    chainCalls = [];
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-02T06:00:00Z'));
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ToastService, useValue: { error: vi.fn(), success: vi.fn() } },
        { provide: LiveDataAccessService, useValue: { requestedLive: () => false } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) } } },
        { provide: PricingContextService, useValue: { resolve: (_s: string, _e: string, spot: number | null | undefined) => of(context(spot ?? 0)) } },
      ],
    });
    const greeks = TestBed.inject(GreeksCalculatorService);
    vi.spyOn(greeks, 'getSymbols').mockReturnValue(of(['NIFTY', 'ICICIBANK']));
    vi.spyOn(greeks, 'getSymbolDetails').mockImplementation(({ symbol }): Observable<GreeksSymbolDetails> => {
      const reply = new Subject<GreeksSymbolDetails>();
      detailCalls.push({ symbol, reply });
      return reply;
    });
    vi.spyOn(TestBed.inject(OptionsChainService), 'getOptionChain').mockImplementation((request): Observable<OptionsChainViewModel> => {
      const reply = new Subject<OptionsChainViewModel>();
      chainCalls.push({ request, reply });
      return reply;
    });
  });

  afterEach(() => vi.useRealTimers());

  describe('Greeks strike dropdown', () => {
    const strikeSelect = (host: HTMLElement) => host.querySelector('#strikeSelect') as HTMLSelectElement;

    it('shows the selected (ATM) strike, not the first listed strike, once the symbol loads', () => {
      const fixture = TestBed.createComponent(GreeksComponent);
      fixture.detectChanges();
      answerDetails('NIFTY');
      fixture.detectChanges();
      expect(fixture.componentInstance.form.value.strike).toBe(25000);
      expect(strikeSelect(fixture.nativeElement).value).toBe('25000');
    });

    it('still shows the selected strike after Custom -> EOD re-creates the dropdown, and after a symbol switch', () => {
      const fixture = TestBed.createComponent(GreeksComponent);
      fixture.detectChanges();
      answerDetails('NIFTY');
      fixture.detectChanges();
      fixture.componentInstance.setMode('custom');
      fixture.detectChanges();
      fixture.componentInstance.setMode('eod');
      fixture.detectChanges();
      expect(strikeSelect(fixture.nativeElement).value).toBe('25000');
      fixture.componentInstance.selectSymbol('ICICIBANK');
      answerDetails('ICICIBANK');
      fixture.detectChanges();
      expect(fixture.componentInstance.form.value.strike).toBe(1400);
      expect(strikeSelect(fixture.nativeElement).value).toBe('1400');
    });

    it('shows "Custom strike" when the typed strike is not listed', () => {
      const fixture = TestBed.createComponent(GreeksComponent);
      fixture.detectChanges();
      answerDetails('NIFTY');
      fixture.detectChanges();
      // Typed like a user (an input event), so the OnPush view is refreshed as it is in the browser.
      const input = (fixture.nativeElement as HTMLElement).querySelector('input[formControlName="strike"]') as HTMLInputElement;
      input.value = '25050';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(fixture.componentInstance.form.value.strikeKey).toBe('custom');
      expect(strikeSelect(fixture.nativeElement).value).toBe('custom');
    });
  });

  describe('Greeks failed symbol load', () => {
    it('drops the previous symbol\'s metadata badge and strike list', () => {
      const fixture = TestBed.createComponent(GreeksComponent);
      fixture.detectChanges();
      answerDetails('NIFTY');
      const component = fixture.componentInstance;
      expect(component.badgeText).toContain('NIFTY');
      component.selectSymbol('ICICIBANK');
      failDetails('ICICIBANK');
      expect(component.badgeText).not.toContain('NIFTY');
      expect(component.strikeOptions).toEqual([]);
      expect(component.results).toEqual({});
    });
  });

  describe('Probability', () => {
    it('ignores a late at-the-money IV answer for the previous symbol while the next one loads or after it fails', async () => {
      const fixture = TestBed.createComponent(ProbabilityComponent);
      fixture.detectChanges();
      answerDetails('NIFTY'); // the NIFTY ATM chain request is now in flight
      const component = fixture.componentInstance;
      component.selectSymbol('ICICIBANK');
      answerChain('NIFTY', chain(25000, 130, 120)); // late answer for the symbol that is no longer selected
      expect(component.atmStatus).not.toBe('ready');
      expect(component.atmIv).toBeNull();
      failDetails('ICICIBANK');
      component.onFieldChange();
      await new Promise(resolve => setTimeout(resolve, 300)); // past the calculation debounce
      expect(component.data).toBeNull();
    });
  });

  describe('Implied Volatility', () => {
    it('ignores a late close-price answer for the previous symbol, and keeps none of its expiries after a failed load', () => {
      const fixture = TestBed.createComponent(ImpliedVolatilityComponent);
      fixture.detectChanges();
      answerDetails('NIFTY'); // the NIFTY close-price request is now in flight
      const component = fixture.componentInstance;
      component.selectSymbol('ICICIBANK');
      failDetails('ICICIBANK');
      answerChain('NIFTY', chain(25000, 130, 120)); // late answer for the symbol that is no longer selected
      expect(component.result).toBeNull();
      expect(component.underlyingControl.value).not.toBe(25000);
      expect(component.closeStatus).not.toBe('ready');
      expect(component.expiryOptions).toEqual([]);
      expect(component.expiryDate).toBe('');
      expect(component.strikes).toEqual([]);
      expect(component.sourceNote).not.toContain('2026-10-30');
    });
  });

  describe('Options Chain failed symbol load', () => {
    it('stops loading and shows the error instead of spinning forever', () => {
      const fixture = TestBed.createComponent(OptionsChainComponent);
      fixture.detectChanges();
      failDetails('NIFTY');
      fixture.detectChanges();
      const component = fixture.componentInstance;
      expect(component.detailsLoading).toBe(false);
      expect(component.loading).toBe(false);
      expect(component.error).toContain('Unable to load symbol details');
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('Unable to load symbol details');
    });
  });
});
