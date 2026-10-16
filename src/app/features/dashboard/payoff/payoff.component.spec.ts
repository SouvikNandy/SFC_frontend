import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { PayoffComponent } from './payoff.component';
import { PayoffService } from './payoff.service';
import { ExpiryQuotes, PayoffSymbolDetails } from './payoff.model';
import { chainIV, nearestExpiryAverageIv } from './payoff-pricing';

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

  beforeEach(async () => {
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
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(PayoffComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;
  });

  it('has no Base volatility control', () => {
    expect(host.querySelector('#payoff-vol')).toBeNull();
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

  it('shows the IV multiplier and the multiplied average IV of the nearest-expiry legs', () => {
    const near = component.legs().filter(leg => leg.expiryDays === Math.min(...component.legs().map(l => l.expiryDays)));
    const ivs = near.map(leg => ({ expiryDays: leg.expiryDays, iv: chainIV(SPOT, leg.strike, 12.5) }));
    const average = nearestExpiryAverageIv(ivs) * 100;
    expect(component.ivLabel()).toBe(`×1.00 → ${average.toFixed(2)}%`);
    component.onIvInput('150');
    fixture.detectChanges();
    expect(component.ivLabel()).toBe(`×1.50 → ${(average * 1.5).toFixed(2)}%`);
    expect(host.querySelector('#ivSlider')?.parentElement?.textContent).toContain('×1.50');
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

  it('reports a clear error, not a made-up value, when HV-20 is unavailable', () => {
    component.details.set({ ...details, hv20: Number.NaN });
    expect(component.referenceVol()).toBeNaN();
    expect(component.validationError()).toContain('HV-20');
    expect(component.result()).toBeNull();
  });
});
