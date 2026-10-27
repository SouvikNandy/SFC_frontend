import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { Observable, Subject, of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { bsPrice } from '../../../shared/pricing/option-pricing';

import { ToastService } from '../../../core/services/toast.service';
import { GreeksCalculatorService } from '../greeks/greeks-calculator.service';
import { GreeksSymbolDetails } from '../greeks/greeks.model';
import { PricingContext, PricingContextService } from '../../../shared/pricing/pricing-context.service';
import { LiveDataAccessService } from '../live-data/live-data-access.service';
import { OptionsChainRow, OptionsChainSide, OptionsChainViewModel } from './models/chain.model';
import { OptionsChainComponent } from './options-chain.component';
import { OptionsChainService } from './options-chain.service';

const side = (oi: number): OptionsChainSide => ({
  oi, oiChange: 0, volume: 0, iv: 0, ltp: 1, ltpChange: 0, delta: null, gamma: null, theta: null, vega: null, itm: false,
});
const view = (strike: number): OptionsChainViewModel => ({
  spot: 22600, spotChange: null, spotChangePercent: null, pcr: null, maxPain: null, callOi: null, putOi: null, atmIv: null,
  rows: [{ strike, call: side(1), put: side(2) } as OptionsChainRow],
  chart: { callOi: [], putOi: [], callIv: [], putIv: [] },
});
const details = (symbol: string): GreeksSymbolDetails => ({
  symbol, trade_date: '2026-10-16', expiry_date: ['2026-10-29', '2026-11-05'], underlying: 22600, strike: [22600], atm_strike: 22600, hv20: 15,
});

const INDEX_CONTEXT: PricingContext = { ok: true, kind: 'index', underlying: 22600, riskFreeRate: 0.055, dividendYield: 0.01, futures: null };

describe('OptionsChainComponent chain loading', () => {
  let component: OptionsChainComponent;
  let context: PricingContext;
  let resolveCalls: Array<{ symbol: string; expiry: string; spot: number | null | undefined }>;
  let chainCalls: Subject<OptionsChainViewModel>[];
  const toastError = vi.fn();

  beforeEach(async () => {
    chainCalls = [];
    context = INDEX_CONTEXT;
    resolveCalls = [];
    toastError.mockClear();
    await TestBed.configureTestingModule({
      imports: [OptionsChainComponent],
      providers: [
        {
          provide: GreeksCalculatorService,
          useValue: {
            getSymbols: () => of(['NIFTY', 'BANKNIFTY']),
            getSymbolDetails: ({ symbol }: { symbol: string }) => of(details(symbol)),
            calculateAll: () => ({ deltaCall: 0, deltaPut: 0, gamma: 0, thetaCall: 0, thetaPut: 0, vega: 0 }),
          },
        },
        {
          provide: OptionsChainService,
          useValue: {
            getOptionChain: (): Observable<OptionsChainViewModel> => {
              const call = new Subject<OptionsChainViewModel>();
              chainCalls.push(call);
              return call;
            },
          },
        },
        {
          provide: PricingContextService,
          useValue: {
            resolve: (symbol: string, expiry: string, spot: number | null | undefined) => {
              resolveCalls.push({ symbol, expiry, spot });
              return of(context);
            },
          },
        },
        { provide: ToastService, useValue: { error: toastError, success: vi.fn() } },
        { provide: LiveDataAccessService, useValue: { requestedLive: () => false } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) } } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(OptionsChainComponent);
    component = fixture.componentInstance;
    fixture.detectChanges(); // loads symbols, selects NIFTY, loads details, requests the first chain
  });

  afterEach(() => vi.restoreAllMocks());

  it('requests the chain for the default symbol and first expiry, then shows the rows', () => {
    expect(chainCalls.length).toBe(1);
    expect(component.loading).toBe(true);
    chainCalls[0].next(view(22600));
    expect(component.loading).toBe(false);
    expect(component.rows.map((row) => row.strike)).toEqual([22600]);
    expect(component.error).toBe('');
  });

  it('clears the loading state and reports an error when the chain request fails', () => {
    chainCalls[0].error(new Error('500'));
    expect(component.loading).toBe(false);
    expect(component.error).not.toBe('');
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(component.rows).toEqual([]);
  });

  it('keeps the latest expiry when an earlier chain response arrives late', () => {
    chainCalls[0].next(view(22600));
    component.expiry = '2026-11-05';
    component.loadChain();
    component.expiry = '2026-10-29';
    component.loadChain();
    expect(chainCalls.length).toBe(3);

    chainCalls[2].next(view(23000)); // the newest request answers first
    chainCalls[1].next(view(24000)); // the superseded request answers late
    expect(component.rows.map((row) => row.strike)).toEqual([23000]);
    expect(component.loading).toBe(false);
  });

  it('recovers after a failed chain request when the expiry is changed', () => {
    chainCalls[0].error(new Error('500'));
    component.loadChain();
    expect(component.error).toBe('');
    expect(component.loading).toBe(true);
    chainCalls[1].next(view(22600));
    expect(component.loading).toBe(false);
    expect(component.rows.length).toBe(1);
  });

  it('finds the highest put/call OI across all strikes, not just the visible window', () => {
    const rows = Array.from({ length: 41 }, (_, i) => {
      const strike = 21000 + i * 100; // 21000 … 25000, spot 22600 → default window is ATM ±10
      return { strike, call: side(strike === 25000 ? 900 : 10), put: side(strike === 21000 ? 800 : 5) } as OptionsChainRow;
    });
    chainCalls[0].next({ ...view(22600), rows });
    expect(component.visibleRows.some((row) => row.strike === 25000)).toBe(false);
    expect(component.highestOiStrikes).toEqual({ put: 21000, call: 25000 });
  });

  it('does not show the previous expiry’s highest-OI strikes while a new expiry is loading', () => {
    const rows = [{ strike: 22600, call: side(5), put: side(9) } as OptionsChainRow];
    chainCalls[0].next({ ...view(22600), rows });
    expect(component.highestOiStrikes).toEqual({ put: 22600, call: 22600 });
    component.expiry = '2026-11-05';
    component.loadChain();
    expect(component.highestOiStrikes).toEqual({ put: null, call: null });
    chainCalls[1].next({ ...view(23000), rows: [{ strike: 23000, call: side(1), put: side(1) } as OptionsChainRow] });
    expect(component.highestOiStrikes).toEqual({ put: 23000, call: 23000 });
  });

  describe('days to expiry', () => {
    afterEach(() => vi.useRealTimers());

    it('counts from today in IST, not the EOD trade date, and shows the valuation date', () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-21T06:00:00Z')); // 11:30 IST; trade_date in the fixture is 16 Oct
      component.expiry = '2026-10-27';
      expect(component.expiryDisplayNote).toBe('Expiry 27 Oct 2026 · 6 days to expiry · Valuation date 21 Oct 2026');
    });

    it('displays 0 days on expiry day', () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-27T06:00:00Z'));
      component.expiry = '2026-10-27';
      expect(component.expiryDisplayNote).toContain('0 days to expiry');
    });
  });

  describe('Max pain', () => {
    const chain = [
      { strike: 100, call: side(10), put: side(5) },
      { strike: 110, call: side(20), put: side(20) },
      { strike: 120, call: side(5), put: side(40) },
    ] as OptionsChainRow[];

    it('is computed from every strike of the expiry and ignores the API max_pain value', () => {
      chainCalls[0].next({ ...view(22600), rows: chain, maxPain: 105 });
      expect(component.visibleRows.length).toBe(3);
      expect(component.maxPain).toBe(120);
    });

    it('uses all strikes even when the ATM window hides some', () => {
      const wide = Array.from({ length: 41 }, (_, i) => ({ strike: 21000 + i * 100, call: side(0), put: side(0) })) as OptionsChainRow[];
      wide[40] = { strike: 25000, call: side(0), put: side(50) } as OptionsChainRow; // far from spot 22600, hidden by ATM ±10
      chainCalls[0].next({ ...view(22600), rows: wide });
      expect(component.visibleRows.some((row) => row.strike === 25000)).toBe(false);
      expect(component.maxPain).toBe(25000);
    });

    it('recomputes for a new expiry and is blank while it loads', () => {
      chainCalls[0].next({ ...view(22600), rows: chain });
      expect(component.maxPain).toBe(120);
      component.expiry = '2026-11-05';
      component.loadChain();
      expect(component.maxPain).toBeNull();
      chainCalls[1].next({ ...view(22600), rows: [{ strike: 100, call: side(50), put: side(1) }, { strike: 110, call: side(1), put: side(1) }] as OptionsChainRow[] });
      expect(component.maxPain).toBe(100);
    });

    it('is null (tile shows "–") for no rows or no usable OI, even if the API sent a value', () => {
      chainCalls[0].next({ ...view(22600), rows: [{ strike: 100, call: side(0), put: side(0) }] as OptionsChainRow[], maxPain: 22500 });
      expect(component.maxPain).toBeNull();
      const fixture = TestBed.createComponent(OptionsChainComponent);
      fixture.detectChanges();
      const tile = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.stat-strip .sitem'))
        .find((el) => el.querySelector('.lab')?.textContent?.trim() === 'Max pain');
      expect(tile?.querySelector('.num')?.textContent?.trim()).toBe('–');
    });
  });

  it('labels the chain IV and Greeks as solved from each contract\'s Close (EOD), and its price column as Close (EOD)', () => {
    const fixture = TestBed.createComponent(OptionsChainComponent);
    fixture.detectChanges();
    chainCalls[chainCalls.length - 1].next(view(22600));
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const headers = Array.from(host.querySelectorAll('th')).map((th) => th.textContent?.trim());
    expect(headers).toContain('IV');
    expect(headers).toContain('Close (EOD)');
    expect(headers).not.toContain('IV (est.)');
    expect(headers).not.toContain('LTP');
    expect(host.querySelector('.sub')?.textContent).toContain("solved from each contract's own Close (EOD)");
    expect(host.querySelector('.sub')?.textContent).not.toMatch(/estimate|HV-20/);
    expect(host.textContent).not.toContain('Base volatility');
    expect(host.textContent).toContain('IV underlying');
  });

  describe('implied volatility per strike and side', () => {
    const DAYS = 6;
    const EXPIRY = '2026-10-29';
    const closeOf = (kind: 'call' | 'put', strike: number, vol: number, underlying = 22600, rate = 0.055, dividend = 0.01) =>
      Math.round(bsPrice(kind, underlying, strike, rate, dividend, DAYS / 365, vol) * 100) / 100;
    const chainWith = (rows: Array<{ strike: number; call: number; put: number }>): OptionsChainViewModel => ({
      ...view(22600),
      rows: rows.map((row) => ({ strike: row.strike, call: { ...side(10), ltp: row.call }, put: { ...side(10), ltp: row.put } }) as OptionsChainRow),
    });

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-23T06:00:00Z')); // 6 days before 29 Oct, IST
      component.expiry = EXPIRY;
      component.loadChain();
    });
    afterEach(() => vi.useRealTimers());
    const respond = (chain: OptionsChainViewModel) => chainCalls[chainCalls.length - 1].next(chain);

    it('solves call and put IV separately from each contract\'s own close, and the Greeks follow each side\'s IV', () => {
      respond(chainWith([
        { strike: 22600, call: closeOf('call', 22600, 0.15), put: closeOf('put', 22600, 0.19) },
        { strike: 22900, call: closeOf('call', 22900, 0.17), put: closeOf('put', 22900, 0.21) },
      ]));
      const [atm, otm] = component.rows;
      expect(atm.call.iv).toBeCloseTo(15, 1);
      expect(atm.put.iv).toBeCloseTo(19, 1);
      expect(otm.call.iv).toBeCloseTo(17, 1);
      expect(otm.put.iv).toBeCloseTo(21, 1);
      expect(atm.call.iv).not.toBeCloseTo(atm.put.iv, 1); // no longer identical
      expect(atm.call.delta).toBeGreaterThan(0);
      expect(atm.put.delta).toBeLessThan(0);
      expect([atm.call.gamma, atm.call.theta, atm.call.vega, atm.put.gamma].every((value) => value !== null && Number.isFinite(value))).toBe(true);
    });

    it('asks for the pricing inputs of the selected symbol and expiry, with the spot from the symbol details', () => {
      expect(resolveCalls[resolveCalls.length - 1]).toEqual({ symbol: 'NIFTY', expiry: EXPIRY, spot: 22600 });
      component.expiry = '2026-11-05';
      component.loadChain();
      expect(resolveCalls[resolveCalls.length - 1]).toEqual({ symbol: 'NIFTY', expiry: '2026-11-05', spot: 22600 });
    });

    it('uses the resolved underlying and rates: a stock is solved on its futures close, not on the spot', () => {
      context = { ok: true, kind: 'stock', underlying: 22650, riskFreeRate: 0.0001, dividendYield: 0, futures: { expiry: EXPIRY, price: 22650 } };
      component.loadChain();
      respond(chainWith([{ strike: 22650, call: closeOf('call', 22650, 0.2, 22650, 0.0001, 0), put: closeOf('put', 22650, 0.2, 22650, 0.0001, 0) }]));
      expect(component.rows[0].call.iv).toBeCloseTo(20, 1);
      expect(component.rows[0].put.iv).toBeCloseTo(20, 1);
      expect(component.ivUnderlying).toBe(22650);
      expect(component.ivBasisNote).toContain('Futures close');
      expect(component.ivBasisNote).toContain('rate 0.01%');
    });

    it('shows no IV or Greeks, and says why, when the pricing inputs are unavailable (no spot or other-expiry fallback)', () => {
      context = { ok: false, reason: 'missing-futures-price' };
      component.loadChain();
      respond(chainWith([{ strike: 22600, call: 124.4, put: 150.7 }]));
      const row = component.rows[0];
      expect([row.call.iv, row.put.iv]).toEqual([0, 0]);
      expect([row.call.delta, row.call.gamma, row.call.theta, row.call.vega, row.put.delta]).toEqual([null, null, null, null, null]);
      expect(component.cellValue(row.call, 'iv')).toBe('–');
      expect(component.cellValue(row.call, 'delta')).toBe('–');
      expect(component.ivUnderlying).toBeNull();
      expect(component.ivBasisNote).toContain('futures close for this expiry is unavailable');
    });

    it('has no IV for a contract without a close, or one priced below its no-arbitrage floor', () => {
      respond(chainWith([{ strike: 22600, call: 0, put: 150.7 }, { strike: 20000, call: 1, put: 0 }]));
      expect(component.rows[0].call.iv).toBe(0);
      expect(component.rows[0].put.iv).toBeGreaterThan(0);
      expect(component.rows[1].call.iv).toBe(0); // below intrinsic
    });

    it('has no IV on expiry day and none for a past expiry', () => {
      vi.setSystemTime(new Date('2026-10-29T06:00:00Z'));
      component.loadChain();
      respond(chainWith([{ strike: 22600, call: 124.4, put: 150.7 }]));
      expect(component.rows[0].call.iv).toBe(0);
      vi.setSystemTime(new Date('2026-10-30T06:00:00Z'));
      component.loadChain();
      respond(chainWith([{ strike: 22600, call: 124.4, put: 150.7 }]));
      expect(component.rows[0].put.iv).toBe(0);
    });
  });

  it('shows "–" for IV when there is none rather than a number', () => {
    expect(component.cellValue({ ...view(22600).rows[0].call, iv: 0 }, 'iv')).toBe('–');
    expect(component.cellValue({ ...view(22600).rows[0].call, iv: Number.NaN }, 'iv')).toBe('–');
  });

  it('shows no highest-OI strikes when there are no rows', () => {
    expect(component.highestOiStrikes).toEqual({ put: null, call: null });
  });

  it('shows no highest-OI strikes when every OI value is zero or invalid', () => {
    const rows = [
      { strike: 22500, call: side(0), put: side(0) },
      { strike: 22600, call: side(Number.NaN), put: side(Number.NaN) },
    ] as OptionsChainRow[];
    chainCalls[0].next({ ...view(22600), rows });
    expect(component.highestOiStrikes).toEqual({ put: null, call: null });
  });

  it('judges call and put OI independently, ignoring zero and invalid strikes', () => {
    const rows = [
      { strike: 22500, call: side(0), put: side(40) },
      { strike: 22600, call: side(Number.NaN), put: side(0) },
      { strike: 22700, call: side(70), put: side(Number.NaN) },
    ] as OptionsChainRow[];
    chainCalls[0].next({ ...view(22600), rows });
    expect(component.highestOiStrikes).toEqual({ put: 22500, call: 22700 });
  });

  it('renders "–" in the tiles when there is no usable OI', () => {
    const fixture = TestBed.createComponent(OptionsChainComponent);
    fixture.detectChanges();
    const tile = (label: string) =>
      Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.stat-strip .sitem'))
        .find((el) => el.querySelector('.lab')?.textContent?.trim() === label)
        ?.querySelector('.num')?.textContent?.trim();
    expect(tile('Highest Put OI')).toBe('–');
    expect(tile('Highest Call OI')).toBe('–');
  });

  it('labels the tiles Highest Put OI / Highest Call OI with tooltips and drops Support/Resistance', () => {
    const fixture = TestBed.createComponent(OptionsChainComponent);
    fixture.detectChanges();
    const tiles = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.stat-strip .sitem'));
    const text = tiles.map((tile) => tile.querySelector('.lab')?.textContent?.trim());
    expect(text).toContain('Highest Put OI');
    expect(text).toContain('Highest Call OI');
    expect(text).not.toContain('Support');
    expect(text).not.toContain('Resistance');
    const titles = tiles.map((tile) => tile.getAttribute('title'));
    expect(titles).toContain('Strike with the highest put open interest for this expiry.');
    expect(titles).toContain('Strike with the highest call open interest for this expiry.');
  });

  it('formats September expiries as "Sep"', () => {
    expect(component.formatExpiry('2027-09-28')).toBe('28 Sep 2027');
  });

  it('drops a pending chain response when another symbol is selected', () => {
    component.selectSymbol('BANKNIFTY');
    expect(chainCalls.length).toBe(2);
    chainCalls[0].next(view(11111)); // NIFTY response, now stale
    expect(component.rows).toEqual([]);
    chainCalls[1].next(view(50000));
    expect(component.rows.map((row) => row.strike)).toEqual([50000]);
  });
});
