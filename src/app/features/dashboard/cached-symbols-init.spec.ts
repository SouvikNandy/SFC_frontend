import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { Subject, of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastService } from '../../core/services/toast.service';
import { atmImpliedVolatility } from '../../shared/pricing/atm-iv';
import { PricingContext, PricingContextService } from '../../shared/pricing/pricing-context.service';
import { GreeksComponent } from './greeks/greeks.component';
import { GreeksCalculatorService } from './greeks/greeks-calculator.service';
import { GreeksSymbolDetails } from './greeks/greeks.model';
import { ImpliedVolatilityComponent } from './implied-volatility/implied-volatility.component';
import { LiveDataAccessService } from './live-data/live-data-access.service';
import { ProbabilityComponent } from './probability/probability.component';
import { OptionsChainRow, OptionsChainViewModel } from './options-chain/models/chain.model';
import { OptionsChainService } from './options-chain/options-chain.service';

/**
 * Regression: once any screen has loaded the symbol list it is cached, so `getSymbols()` emits synchronously.
 * The details pipeline must already be subscribed then, otherwise the first symbol selection is lost and the
 * tool opens empty after sidebar navigation.
 */
const DETAILS: GreeksSymbolDetails = {
  symbol: 'NIFTY',
  trade_date: '2026-10-19',
  expiry_date: ['2026-10-27', '2026-11-03'],
  underlying: 25000,
  strike: [24900, 25000, 25100],
  atm_strike: 25000,
  hv20: 14,
  market_price: { CE: 150.5, PE: 140.25 },
};

// The chain's c_ltp / p_ltp carry the EOD close (verified live), which is what IV is solved from. LTP (150.5 / 140.25) differs on purpose.
const side = (ltp: number) => ({ oi: 0, oiChange: 0, volume: 0, iv: 0, ltp, ltpChange: 0, delta: null, gamma: null, theta: null, vega: null, itm: false });
const CHAIN: OptionsChainViewModel = {
  spot: 25000, spotChange: null, spotChangePercent: null, pcr: null, maxPain: null, callOi: null, putOi: null, atmIv: null,
  rows: [
    { strike: 24900, call: side(210.25), put: side(80.5) },
    { strike: 25000, call: side(130), put: side(120) },
  ] as OptionsChainRow[],
  chart: { callOi: [], putOi: [], callIv: [], putIv: [] },
};
const INDEX_CONTEXT: PricingContext = { ok: true, kind: 'index', underlying: 25000, riskFreeRate: 0.055, dividendYield: 0.01, futures: null };
const NOTE = 'Expiry 27 Oct 2026 · 6 days to expiry · Valuation date 21 Oct 2026';

describe('tools load symbol details when the symbol list is already cached', () => {
  let context: PricingContext;
  let resolveCalls: Array<{ symbol: string; expiry: string; spot: number | null | undefined }>;

  beforeEach(() => {
    context = INDEX_CONTEXT;
    resolveCalls = [];
    // 21 Oct 2026, 11:30 IST. trade_date is 19 Oct, so the old trade-date count would be 8; today-based it is 6.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-21T06:00:00Z'));
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ToastService, useValue: { error: vi.fn(), success: vi.fn() } },
        { provide: LiveDataAccessService, useValue: { requestedLive: () => false } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) } } },
        {
          provide: PricingContextService,
          useValue: { resolve: (symbol: string, expiry: string, spot: number | null | undefined) => { resolveCalls.push({ symbol, expiry, spot }); return of(context); } },
        },
      ],
    });
    const greeks = TestBed.inject(GreeksCalculatorService);
    vi.spyOn(greeks, 'getSymbols').mockReturnValue(of(['NIFTY', 'BANKNIFTY'])); // synchronous, like the cache
    vi.spyOn(greeks, 'getSymbolDetails').mockReturnValue(of(DETAILS));
    vi.spyOn(TestBed.inject(OptionsChainService), 'getOptionChain').mockReturnValue(of(CHAIN));
  });

  afterEach(() => vi.useRealTimers());

  describe('Probability', () => {
    it('fills spot and expiry, and takes its volatility from the at-the-money implied volatility, not HV-20', () => {
      const fixture = TestBed.createComponent(ProbabilityComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;
      expect(component.symbolDetails?.symbol).toBe('NIFTY');
      expect(component.spotControl.value).toBe(25000);
      expect(component.expiryControl.value).toBe(6);
      expect(component.expiryDisplayNote).toBe(NOTE);
      const atm = atmImpliedVolatility(INDEX_CONTEXT, [{ strike: 24900, callClose: 210.25, putClose: 80.5 }, { strike: 25000, callClose: 130, putClose: 120 }], 6)!;
      expect(atm.strike).toBe(25000);
      expect(component.volControl.value).toBeCloseTo(atm.averagePct, 1);
      expect(component.volControl.value).not.toBe(14); // the symbol's HV-20
      expect(component.atmStatus).toBe('ready');
      expect(component.volHint).toContain('ATM implied volatility, strike 25000');
      expect(component.data).toBeNull(); // the result arrives after the debounce
      expect(component.detailsLoading).toBe(false);
    });

    it('asks for the pricing inputs of the symbol and its first expiry date', () => {
      TestBed.createComponent(ProbabilityComponent).detectChanges();
      expect(resolveCalls[0]).toEqual({ symbol: 'NIFTY', expiry: '2026-10-27', spot: 25000 });
    });

    it('has no volatility, and says why, when the pricing inputs are unavailable: HV-20 is not substituted', () => {
      context = { ok: false, reason: 'missing-futures-price' };
      const fixture = TestBed.createComponent(ProbabilityComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;
      expect(component.atmStatus).toBe('unavailable');
      expect(component.volControl.value).toBe(0);
      expect(component.volHint).toContain('futures close for this expiry is unavailable');
    });

    it('reports a chain failure as unavailable, never as a number', () => {
      vi.mocked(TestBed.inject(OptionsChainService).getOptionChain).mockReturnValue(new Subject<OptionsChainViewModel>());
      const fixture = TestBed.createComponent(ProbabilityComponent);
      fixture.detectChanges();
      expect(fixture.componentInstance.atmStatus).toBe('loading');
      expect(fixture.componentInstance.volControl.value).toBe(0);
    });
  });

  describe('Implied Volatility', () => {
    it('fills underlying, ATM strike, market price, rate and dividend from the pricing context', () => {
      const fixture = TestBed.createComponent(ImpliedVolatilityComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;
      expect(component.symbolDetails?.symbol).toBe('NIFTY');
      expect(component.underlyingControl.value).toBe(25000);
      expect(component.strikeControl.value).toBe(25000);
      expect(component.marketPriceControl.value).toBe(130); // the EOD close of the 25000 call, not the 150.5 LTP
      expect(component.expiryControl.value).toBe(6);
      expect(component.rateControl.value).toBeCloseTo(5.5, 10);
      expect(component.dividendControl.value).toBeCloseTo(1, 10);
      expect(component.expiryDisplayNote).toBe(NOTE);
      expect(component.underlyingHint).toBe('Spot index value');
      expect(component.result?.ok).toBe(true);
    });

    it('uses a stock\'s futures close and its 0.01 % / 0 % parameters', () => {
      context = { ok: true, kind: 'stock', underlying: 25040, riskFreeRate: 0.0001, dividendYield: 0, futures: { expiry: '2026-10-27', price: 25040, tradeDate: '2026-10-20' } };
      const fixture = TestBed.createComponent(ImpliedVolatilityComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;
      expect(component.underlyingControl.value).toBe(25040);
      expect(component.rateControl.value).toBeCloseTo(0.01, 10);
      expect(component.dividendControl.value).toBe(0);
      expect(component.underlyingHint).toContain('Futures close, 27 Oct 2026 expiry');
    });

    it('shows no result, and the reason, when the underlying cannot be resolved (no spot or other-expiry fallback)', () => {
      context = { ok: false, reason: 'missing-futures-price' };
      const fixture = TestBed.createComponent(ImpliedVolatilityComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;
      expect(component.result).toBeNull();
      expect(component.underlyingControl.value).toBe(0);
      expect(component.error).toContain('futures close for this expiry is unavailable');
    });

    it('has no IV on expiry day (zero days), not an IV at an invented one day', () => {
      vi.setSystemTime(new Date('2026-10-27T06:00:00Z'));
      const component = TestBed.createComponent(ImpliedVolatilityComponent);
      component.detectChanges();
      expect(component.componentInstance.expiryControl.value).toBe(0);
      expect(component.componentInstance.expiryDisplayNote).toBe('Expiry 27 Oct 2026 · 0 days to expiry · Valuation date 27 Oct 2026');
      expect(component.componentInstance.result?.ok).toBe(false);
    });

    it('label its auto-filled market price as Close (EOD), not LTP', () => {
      const iv = TestBed.createComponent(ImpliedVolatilityComponent);
      iv.detectChanges();
      const hint = Array.from((iv.nativeElement as HTMLElement).querySelectorAll('.field-hint')).map((el) => el.textContent ?? '');
      expect(hint.some((text) => text.includes('Close (EOD) · call, BhavCopy'))).toBe(true);
      expect((iv.nativeElement as HTMLElement).textContent).not.toContain('market_price');
    });

    describe('price input is the EOD close', () => {
      const chains = () => TestBed.inject(OptionsChainService);

      it('requests the chain for the symbol and first expiry date and uses the close of the selected strike and side', () => {
        const spy = chains().getOptionChain as unknown as ReturnType<typeof vi.fn>;
        const fixture = TestBed.createComponent(ImpliedVolatilityComponent);
        fixture.detectChanges();
        const component = fixture.componentInstance;
        expect(spy).toHaveBeenCalledWith({ symbol: 'NIFTY', expiry: '2026-10-27' });
        expect(component.marketPriceControl.value).toBe(130);
        component.selectOptionType('put');
        expect(component.marketPriceControl.value).toBe(120);
        component.strikeControl.setValue(24900);
        component.onStrikeChange();
        expect(component.marketPriceControl.value).toBe(80.5);
        expect(component.result?.ok).toBe(true);
      });

      it('never falls back to the LTP when the strike has no close', () => {
        vi.mocked(chains().getOptionChain).mockReturnValue(of({ ...CHAIN, rows: [{ strike: 24900, call: side(210.25), put: side(80.5) }] as OptionsChainRow[] }));
        const fixture = TestBed.createComponent(ImpliedVolatilityComponent);
        fixture.detectChanges();
        const component = fixture.componentInstance;
        expect(component.marketPriceControl.value).toBe(0);
        expect(component.closePriceHint).toBe('No Close (EOD) for this strike');
        expect(component.result?.ok).toBe(false);
      });

      it('shows no price while the close is loading, and reports an error without using the LTP', () => {
        const pending = new Subject<OptionsChainViewModel>();
        vi.mocked(chains().getOptionChain).mockReturnValue(pending);
        const fixture = TestBed.createComponent(ImpliedVolatilityComponent);
        fixture.detectChanges();
        const component = fixture.componentInstance;
        expect(component.closeStatus).toBe('loading');
        expect(component.marketPriceControl.value).toBe(0);
        expect(component.result).toBeNull();
        pending.error(new Error('500'));
        expect(component.closeStatus).toBe('error');
        expect(component.marketPriceControl.value).toBe(0);
        expect(component.closePriceHint).toContain('unavailable');
      });

      it('reloads the close and the pricing inputs when another expiry is chosen', () => {
        const spy = chains().getOptionChain as unknown as ReturnType<typeof vi.fn>;
        const fixture = TestBed.createComponent(ImpliedVolatilityComponent);
        fixture.detectChanges();
        const component = fixture.componentInstance;
        component.expiryDate = '2026-11-03';
        component.onExpiryChange();
        expect(spy).toHaveBeenLastCalledWith({ symbol: 'NIFTY', expiry: '2026-11-03' });
        expect(resolveCalls[resolveCalls.length - 1].expiry).toBe('2026-11-03');
      });
    });

    it('Custom mode starts from the approved index parameters and can switch to stock', () => {
      const fixture = TestBed.createComponent(ImpliedVolatilityComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;
      component.selectMode('custom');
      expect(component.rateControl.value).toBeCloseTo(5.5, 10);
      component.selectCustomKind('stock');
      expect(component.rateControl.value).toBeCloseTo(0.01, 10);
      expect(component.dividendControl.value).toBe(0);
    });
  });

  describe('Greeks', () => {
    const open = () => {
      const fixture = TestBed.createComponent(GreeksComponent);
      fixture.detectChanges();
      return fixture;
    };

    it('opens in EOD mode with the ATM strike, rate, dividend and the observed Close (EOD) filled', () => {
      const component = open().componentInstance;
      expect(component.form.value.sourceMode).toBe('eod');
      expect(component.symbolDetails?.symbol).toBe('NIFTY');
      expect(component.form.value.spot).toBe(25000);
      expect(component.form.value.strike).toBe(25000);
      expect(component.form.value.ivPrice).toBe(130); // EOD close of the 25000 call; the 150.5 LTP is not used
      expect(component.form.value.expiry).toBe(6);
      expect(component.form.value.rate).toBeCloseTo(5.5, 10);
      expect(component.form.value.dividend).toBeCloseTo(1, 10);
      expect(component.expiryDisplayNote).toBe(NOTE);
    });

    it('solves call and put implied volatility separately from their own closes, and evaluates each side at its own IV', () => {
      const component = open().componentInstance;
      expect(component.results.callIvPct).toBeGreaterThan(0);
      expect(component.results.putIvPct).toBeGreaterThan(0);
      expect(component.results.callIvPct).not.toBeCloseTo(component.results.putIvPct!, 2);
      // Each side reprices to its own Close (EOD).
      expect(component.results.callPrice).toBeCloseTo(130, 4);
      expect(component.results.putPrice).toBeCloseTo(120, 4);
      expect(component.results.deltaCall).toBeGreaterThan(0);
      expect(component.results.deltaPut).toBeLessThan(0);
      expect(component.results.gamma).not.toBeCloseTo(component.results.gammaPut!, 8);
    });

    it('shows the IV pair and where it comes from, and no HV-20', () => {
      const fixture = open();
      const host = fixture.nativeElement as HTMLElement;
      expect(host.querySelector('#ivPair')?.textContent).toMatch(/Call \d+\.\d{2}% · Put \d+\.\d{2}%/);
      expect(host.textContent).toContain("Solved from each contract's own Close (EOD)");
      expect(host.textContent).not.toContain('HV-20');
      expect(host.textContent).toContain('Spot index value');
    });

    it('shows no Greeks, and the reason, when the underlying cannot be resolved', () => {
      context = { ok: false, reason: 'missing-instrument-type' };
      const component = open().componentInstance;
      expect(component.results).toEqual({});
      expect(component.inputError).toContain('instrument type');
    });

    it('has no IV on expiry day: the side notes say so', () => {
      vi.setSystemTime(new Date('2026-10-27T06:00:00Z'));
      const component = open().componentInstance;
      expect(component.form.value.expiry).toBe(0);
      expect(component.expiryDisplayNote).toBe('Expiry 27 Oct 2026 · 0 days to expiry · Valuation date 27 Oct 2026');
      expect(component.results.callIvPct).toBeUndefined();
      expect(component.ivSideNotes.call).toContain('expires today');
    });

    describe('observed price', () => {
      it('follows the option side and the strike, always from the EOD close', () => {
        const component = open().componentInstance;
        expect(component.form.value.ivPrice).toBe(130);
        component.form.patchValue({ ivType: 'put' });
        expect(component.form.value.ivPrice).toBe(120); // switching Call/Put re-reads the price
        component.form.patchValue({ strike: 24900 });
        expect(component.form.value.ivPrice).toBe(80.5);
      });

      it('labels the model call/put prices as model and keeps them distinct from the observed Close (EOD)', () => {
        const fixture = open();
        const component = fixture.componentInstance;
        const host = fixture.nativeElement as HTMLElement;
        const tags = Array.from(host.querySelectorAll('.price-card .tag')).map((tag) => tag.textContent?.trim());
        expect(tags).toEqual(['Call price (model)', 'Put price (model)']);
        expect(host.textContent).not.toContain('Call premium');
        expect(host.textContent).toContain('These are not observed market prices');
        expect(host.querySelector('.iv-source-hint')?.textContent).toContain('Close (EOD) · call · 27 Oct 2026 expiry');
        expect(host.querySelector('.iv-source-hint')?.textContent).not.toContain('LTP');
        // In Custom mode the model price follows the typed volatility while the observed price stays what it was.
        component.setMode('custom');
        component.form.patchValue({ vol: 40, ivPrice: 130 });
        expect(component.results.callPrice).toBeGreaterThan(0);
        expect(component.results.callPrice).not.toBeCloseTo(130, 1);
        expect(component.form.value.ivPrice).toBe(130);
      });

      it('is not overwritten by a model price when other inputs are edited', () => {
        const component = open().componentInstance;
        component.form.patchValue({ vol: 40 });
        component.form.patchValue({ rate: 7 });
        component.form.patchValue({ dividend: 2 });
        component.form.patchValue({ spot: 25100 });
        expect(component.form.value.ivPrice).toBe(130);
      });

      it('leaves the price empty (no LTP, no model price) when the strike has no close', () => {
        const component = open().componentInstance;
        component.form.patchValue({ strike: 26000 });
        expect(component.form.value.ivPrice).toBeNull();
        expect(component.closePriceHint).toBe('No Close (EOD) for this strike');
        expect(component.ivSideNotes.call).toContain('No Close (EOD)');
      });

      it('keeps a hand-entered price in Custom price mode', () => {
        const component = open().componentInstance;
        component.onIvSrcClick('custom');
        component.form.patchValue({ ivPrice: 111.1 });
        component.form.patchValue({ strike: 24900 });
        component.form.patchValue({ ivType: 'put' });
        expect(component.form.value.ivPrice).toBe(111.1);
      });

      it('does not fall back to anything while the close loads or if it fails', () => {
        const pending = new Subject<OptionsChainViewModel>();
        vi.mocked(TestBed.inject(OptionsChainService).getOptionChain).mockReturnValue(pending);
        const component = open().componentInstance;
        expect(component.closeStatus).toBe('loading');
        expect(component.form.value.ivPrice).toBeNull();
        pending.error(new Error('500'));
        expect(component.closeStatus).toBe('error');
        expect(component.form.value.ivPrice).toBeNull();
        expect(component.closePriceHint).toContain('unavailable');
      });
    });

    describe('Custom mode', () => {
      it('starts from the approved index parameters, can switch to stock, and labels a solved IV as implied', () => {
        const component = open().componentInstance;
        component.setMode('custom');
        expect(component.form.value.rate).toBeCloseTo(5.5, 10);
        component.selectCustomKind('stock');
        expect(component.form.value.rate).toBeCloseTo(0.01, 10);
        expect(component.form.value.dividend).toBe(0);
        expect(component.volSourceNote).toBe('');
        component.form.patchValue({ ivPrice: 130, strike: 25000, spot: 25000, expiry: 6 });
        component.solveIv();
        component.applyIv();
        expect(component.volSourceNote).toBe('Implied volatility solved from the market price above');
      });

      it('refuses to solve an IV with no time to expiry instead of inventing one', () => {
        const component = open().componentInstance;
        component.setMode('custom');
        component.form.patchValue({ ivPrice: 130, strike: 25000, spot: 25000, expiry: 0 });
        component.solveIv();
        expect(component.ivResultText).toContain('expires today');
      });
    });

    it('drops the expiry note when the symbol is cleared or the days are typed by hand', () => {
      const component = open().componentInstance;
      expect(component.expiryDate).toBe('2026-10-27');
      component.form.get('expiry')!.setValue(3);
      expect(component.expiryDate).toBe('');
      component.selectSymbol('NIFTY');
      expect(component.expiryDate).toBe('2026-10-27');
      component.clearSymbol();
      expect(component.expiryDate).toBe('');
    });
  });
});
