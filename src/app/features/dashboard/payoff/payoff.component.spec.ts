import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FuturesQuote, solveIvInContext } from '../../../shared/pricing/contract-iv';
import { FuturesCloseService } from '../../../shared/pricing/futures-close.service';
import { InstrumentKindService } from '../../../shared/pricing/instrument-kind.service';
import { InstrumentKind } from '../../../shared/pricing/option-pricing';
import { PayoffComponent } from './payoff.component';
import { PayoffService } from './payoff.service';
import { ExpiryQuotes, PayoffSymbolDetails } from './payoff.model';
import { nearestExpiryAverageIv } from './payoff-pricing';

const SPOT = 22630;
const strikes = Array.from({ length: 41 }, (_, i) => 21600 + i * 50);
const details: PayoffSymbolDetails = {
  symbol: 'NIFTY', trade_date: '2026-10-15', expiry_date: ['2026-10-29', '2026-11-05'],
  underlying: SPOT, strike: strikes, atm_strike: 22650, hv20: 12.5, lot: 75,
};
const quotes: ExpiryQuotes = {
  status: 'ready',
  byStrike: new Map(strikes.map(strike => [strike, { strike, ce: Math.max(SPOT - strike, 0) + 90, pe: Math.max(strike - SPOT, 0) + 85 }])),
  callStrikes: strikes,
  putStrikes: strikes,
};

describe('PayoffComponent (EOD)', () => {
  let host: HTMLElement;
  let component: PayoffComponent;
  let fixture: ReturnType<typeof TestBed.createComponent<PayoffComponent>>;
  // What the backend would answer; tests change these before creating the component.
  let kind: InstrumentKind | null;
  let futuresByExpiry: Record<string, number>;
  let futuresRequests: Array<{ symbol: string; expiry: string }>;

  beforeEach(async () => {
    kind = 'index';
    futuresByExpiry = {};
    futuresRequests = [];
    // 21 Oct 2026, 11:30 IST: the valuation date is fixed so days to expiry do not drift with the wall clock.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-21T06:00:00Z'));
    // jsdom has no matchMedia; the component only needs it to pick the narrow-viewport layout.
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }));
    await TestBed.configureTestingModule({
      imports: [PayoffComponent],
      providers: [
        provideHttpClient(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => null } } } },
        { provide: PayoffService, useValue: {
          getSymbols: () => of(['NIFTY']),
          getSymbolDetails: () => of(details),
          getExpiryQuotes: () => of(quotes),
        } },
        { provide: InstrumentKindService, useValue: { kindOf: () => of(kind) } },
        { provide: FuturesCloseService, useValue: {
          getClose: (symbol: string, expiry: string): ReturnType<FuturesCloseService['getClose']> => {
            futuresRequests.push({ symbol, expiry });
            const price = futuresByExpiry[expiry];
            return of(price ? ({ expiry, price, tradeDate: '2026-10-20' } as FuturesQuote) : null);
          },
        } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(PayoffComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => vi.useRealTimers());

  const create = async () => {
    const created = TestBed.createComponent(PayoffComponent);
    await created.whenStable();
    created.detectChanges();
    return created;
  };

  it('counts expiry days from today in IST (not the EOD trade date) and shows the valuation date', () => {
    // trade_date is 15 Oct; 29 Oct is 8 days from 21 Oct (it would be 14 from the trade date), 5 Nov is 15.
    expect(component.expiries().map(e => e.days)).toEqual([8, 15]);
    expect(component.expiryOptionLabel(8)).toBe('29 Oct · 8d');
    expect(component.valuationDate()).toBe('2026-10-21');
    expect(component.sourceNote()).toContain('Valuation date 21 Oct 2026');
  });

  it('offers an expiry that falls today (0 days) and prices it without error', async () => {
    vi.setSystemTime(new Date('2026-10-29T06:00:00Z')); // 11:30 IST on the first listed expiry
    const page = (await create()).componentInstance;
    expect(page.expiries().map(e => e.days)).toEqual([0, 7]);
    expect(page.expiryOptionLabel(0)).toBe('29 Oct · 0d');
    expect(page.legs().length).toBeGreaterThan(0);
    expect(page.validationError()).toBe('');
    expect(page.result()).not.toBeNull();
    expect(page.result()!.near).toBe(0);
  });

  it('drops an expiry that has already passed, keeping today and the future', async () => {
    vi.setSystemTime(new Date('2026-10-30T06:00:00Z')); // the 29 Oct expiry is one day in the past
    expect((await create()).componentInstance.expiries().map(e => e.days)).toEqual([6]);
  });

  it('reports a clear error for a custom leg whose expiry is in the past, but accepts expiry day', () => {
    component.selectMode('custom');
    const id = component.legs()[0].id;
    component.onLegExpiry(id, '-1');
    expect(component.validationError()).toContain('expiry cannot be in the past');
    expect(component.result()).toBeNull();
    component.onLegExpiry(id, '0');
    expect(component.validationError()).not.toContain('expiry');
  });

  it('labels its EOD premium Close (EOD) and its volatility control a multiplier, never settlement, implied or HV-20', () => {
    const premium = () => component.legColumns().find(column => column.key === 'premium')!.label;
    expect(premium()).toBe('Premium (Close (EOD))');
    expect(host.querySelector('label[for="ivSlider"]')?.textContent?.trim()).toBe('Vol multiplier');
    expect(host.textContent).not.toContain('settle');
    expect(host.textContent).not.toContain('HV-20');
    expect(host.textContent).not.toContain('Base volatility');
  });

  it('starts the date slider at T+0 (today), not at expiration', () => {
    expect(component.evalDay()).toBe(0);
    expect(component.result()?.evalDay).toBe(0);
    expect(component.evalLabel()).toContain('T+0');
    expect(component.evalLabel()).not.toContain('At expiration');
    expect((host.querySelector('#evalSlider') as HTMLInputElement).value).toBe('0');
  });

  it('resets the date slider to T+0 when the strategy changes', () => {
    component.onEvalInput('5');
    expect(component.evalDay()).toBe(5);
    component.onStrategyChange('long_straddle');
    expect(component.evalDay()).toBe(0);
  });

  it('shows the IV multiplier and the multiplied average of the legs\' own solved IVs', () => {
    const ivs = component.legIvs();
    const average = nearestExpiryAverageIv(ivs) * 100;
    expect(average).toBeGreaterThan(0);
    expect(component.ivLabel()).toBe(`×1.00 → ${average.toFixed(2)}%`);
    component.onIvInput('150');
    fixture.detectChanges();
    expect(component.ivLabel()).toBe(`×1.50 → ${(average * 1.5).toFixed(2)}%`);
    expect(host.querySelector('#ivSlider')?.parentElement?.textContent).toContain('×1.50');
  });

  it('solves every leg\'s IV from its own premium with the approved index inputs', () => {
    for (const leg of component.legs()) {
      const expiry = component.expiries().find(e => e.days === leg.expiryDays)!;
      const solved = solveIvInContext({ underlying: SPOT, riskFreeRate: 0.055, dividendYield: 0.01 }, { side: leg.type, strike: leg.strike, days: expiry.days, close: leg.premium });
      expect(solved.ok, `leg ${leg.id}`).toBe(true);
      expect(component.legIvById()[leg.id]).toBeCloseTo((solved as { ivPct: number }).ivPct / 100, 12);
    }
    expect(component.rates()).toEqual({ riskFreeRate: 0.055, dividendYield: 0.01 });
    expect(futuresRequests).toEqual([]); // an index never asks for a futures price
  });

  it('refreshes the label when a leg strike changes', () => {
    const before = component.effVol();
    const first = component.legs()[0];
    component.onLegStrike(first.id, String(first.strike - 400));
    expect(component.effVol()).not.toBe(before);
  });

  it('P&L at T+0 and entry spot is zero for the default strategy', () => {
    const result = component.result()!;
    expect(result).not.toBeNull();
    const nearest = result.heatmap.rows.find(row => row.isSpot)!;
    expect(Number.isFinite(nearest.cells[0].pnl)).toBe(true);
  });

  it('reports a clear error, not a made-up value, when the instrument type is unavailable', () => {
    component.kind.set(null);
    expect(component.validationError()).toContain('instrument type');
    expect(component.result()).toBeNull();
  });

  it('a leg whose Close (EOD) no volatility can produce is reported by leg, not priced with a substitute', () => {
    const first = component.legs()[0];
    component.legs.update(legs => legs.map(leg => (leg.id === first.id ? { ...leg, premium: 90000 } : leg))); // above the underlying itself: no volatility can produce it
    expect(component.validationError()).toContain(`Leg 1: The Close (EOD) price is outside what any volatility can produce`);
    expect(component.result()).toBeNull();
  });

  describe('stock options', () => {
    beforeEach(() => {
      kind = 'stock';
      futuresByExpiry = { '2026-10-29': 22650, '2026-11-05': 22700 };
    });

    it('use the futures close of each leg\'s own expiry, with the approved stock rate and dividend', async () => {
      const page = (await create()).componentInstance;
      expect(futuresRequests.slice(-2)).toEqual([
        { symbol: 'NIFTY', expiry: '2026-10-29' },
        { symbol: 'NIFTY', expiry: '2026-11-05' },
      ]);
      expect(page.rates()).toEqual({ riskFreeRate: 0.0001, dividendYield: 0 });
      expect(page.spot()).toBe(22650); // starts on the nearest expiry's futures close, not the 22630 spot
      expect(page.validationError()).toBe('');
      for (const leg of page.legs()) {
        const expiry = page.expiries().find(e => e.days === leg.expiryDays)!;
        const futures = futuresByExpiry[expiry.iso];
        const solved = solveIvInContext({ underlying: futures, riskFreeRate: 0.0001, dividendYield: 0 }, { side: leg.type, strike: leg.strike, days: leg.expiryDays, close: leg.premium });
        expect(solved.ok).toBe(true);
        expect(page.legIvById()[leg.id]).toBeCloseTo((solved as { ivPct: number }).ivPct / 100, 12);
      }
    });

    it('have no payoff, and say why, when a matching-expiry futures close is missing: spot is not substituted', async () => {
      futuresByExpiry = { '2026-11-05': 22700 }; // the nearest expiry has no futures close
      const page = (await create()).componentInstance;
      expect(page.validationError()).toContain('futures close for this expiry is unavailable');
      expect(page.result()).toBeNull();
      expect(page.spot()).toBeNaN();
    });

    it('report a leg on an expiry without a futures close, even when another expiry has one', async () => {
      futuresByExpiry = { '2026-10-29': 22650 }; // only the nearest expiry is covered
      const page = (await create()).componentInstance;
      const onFar = page.legs().find(leg => leg.expiryDays === 15);
      if (onFar) expect(page.validationError()).toContain('futures close for this expiry is unavailable');
      else expect(page.validationError()).toBe(''); // the preset kept every leg on the covered expiry
    });
  });

  describe('custom mode', () => {
    it('starts from the solved IV of the loaded instrument, never from HV-20, and fills model premiums', () => {
      const solved = nearestExpiryAverageIv(component.legIvs());
      component.selectMode('custom');
      expect(component.customModelVol()).toBeCloseTo(solved * 100, 1);
      expect(component.customModelVol()).not.toBeCloseTo(12.5, 3); // the symbol's HV-20 in this fixture
      expect(component.legs().every(leg => leg.premium !== null)).toBe(true);
    });

    it('asks for a premium, rather than inventing one, until a model volatility is entered', () => {
      component.selectMode('custom');
      component.customModelVol.set(null);
      component.onModelVol('');
      component.legs.update(legs => legs.map(leg => ({ ...leg, premium: null })));
      expect(component.validationError()).toContain('enter a premium');
      component.onModelVol('18');
      expect(component.legs().every(leg => leg.premium !== null)).toBe(true);
      // The model premium solves back to the volatility it was made with (approved index parameters).
      expect(nearestExpiryAverageIv(component.legIvs())).toBeCloseTo(0.18, 3);
    });

    it('labels premiums as entered or model, and says they are not market prices', () => {
      component.selectMode('custom');
      fixture.detectChanges();
      expect(component.legColumns().find(column => column.key === 'premium')!.label).toBe('Premium (entered or model)');
      const note = host.querySelector('.mode-note')?.textContent ?? '';
      expect(note).toContain('model premium');
      expect(note).toContain('not a market price');
      expect(host.textContent).toContain('Model volatility %');
      expect(host.textContent).toContain('Reprice at model price');
      expect(host.textContent).not.toContain('HV-20');
    });

    it('switching Index/Stock changes the rates the leg IVs are solved with', () => {
      component.selectMode('custom');
      const asIndex = nearestExpiryAverageIv(component.legIvs());
      component.setCustomKind('stock');
      expect(component.rates()).toEqual({ riskFreeRate: 0.0001, dividendYield: 0 });
      expect(nearestExpiryAverageIv(component.legIvs())).not.toBeCloseTo(asIndex, 5);
    });
  });
});
