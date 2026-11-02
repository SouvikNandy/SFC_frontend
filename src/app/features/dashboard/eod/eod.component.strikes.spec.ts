import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastService } from '../../../core/services/toast.service';
import { EodComponent } from './eod.component';
import { DdExpiryRequest, EodRequest } from './eod.model';
import { EodService } from './eod.service';
import { ExpiryStrikesResult, ExpiryStrikesService } from './expiry-strikes.service';
import { HistoricalUnderlyingResult, HistoricalUnderlyingService } from './historical-underlying.service';

const row = { date: '2026-01-20', symbol: 'NIFTY', open: 10, high: 12, low: 9, close: 11, volume: 100, oi: 5 };
const EXPIRIES = ['2026-01-06', '2026-01-13', '2026-01-20', '2026-01-27'];
const GRID = [25100, 25200, 25300, 25400];

describe('EodComponent strikes of the selected expiry (dd_strikes)', () => {
    let fixture: ReturnType<typeof TestBed.createComponent<EodComponent>>;
    let component: EodComponent;
    let host: HTMLElement;
    let underlyingCalls: Array<{ symbol: string; till: string }>;
    let strikeCalls: Array<{ symbol: string; expiry: string }>;
    let underlyingFor: (symbol: string, till: string) => Observable<HistoricalUnderlyingResult>;
    let strikesFor: (symbol: string, expiry: string) => Observable<ExpiryStrikesResult>;
    const toastError = vi.fn();
    const getEod = vi.fn((_: EodRequest) => of({ success: true, data: { results: [row], page: 1, has_next: false, has_previous: false } }));
    const closeOn = (session: string, underlying: number): Observable<HistoricalUnderlyingResult> => of({ ok: true, session, underlying, strikes: [], atm: 0 });
    const strikesOk = (strikes: number[]): Observable<ExpiryStrikesResult> => of({ ok: true, strikes });

    async function create() {
        underlyingCalls = [];
        strikeCalls = [];
        underlyingFor = () => closeOn('2026-01-30', 25320.65);
        strikesFor = () => strikesOk(GRID);
        getEod.mockClear();
        toastError.mockClear();
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date(2026, 9, 18, 12, 0));
        await TestBed.configureTestingModule({
            imports: [EodComponent],
            providers: [
                { provide: ToastService, useValue: { error: toastError, success: vi.fn(), info: vi.fn() } },
                { provide: HistoricalUnderlyingService, useValue: { resolve: (symbol: string, till: string) => { underlyingCalls.push({ symbol, till }); return underlyingFor(symbol, till); } } },
                { provide: ExpiryStrikesService, useValue: { resolve: (symbol: string, expiry: string) => { strikeCalls.push({ symbol, expiry }); return strikesFor(symbol, expiry); } } },
                {
                    provide: EodService,
                    useValue: {
                        getSymbols: () => of(['NIFTY', 'BANKNIFTY']),
                        getDdGreeks: ({ symbol }: { symbol: string }) => of({ success: true, data: { symbol, trade_date: '2026-10-16', expiry_date: ['2026-10-20'], underlying: 22630, strike: [22600], atm_strike: 22600, market_price: { CE: 1, PE: 1 } } }),
                        getDdExpiry: (req: DdExpiryRequest) => of({ success: true, data: { symbol: req.symbol, trade_from: req.trade_from, trade_till: req.trade_till, expiry_date: EXPIRIES } }),
                        getEod,
                        getEodChart: () => of({ success: true, data: [] }),
                    },
                },
            ],
        }).compileComponents();
        fixture = TestBed.createComponent(EodComponent);
        component = fixture.componentInstance;
        host = fixture.nativeElement as HTMLElement;
        await settle();
    }
    const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
    const setRange = async (from: string, till: string) => {
        component.onRange('Custom');
        component.onCustomFromChange(from);
        component.onCustomTillChange(till);
        await settle();
    };
    /** Option instrument on 2026-01-01..2026-01-31, expiry 2026-01-27. */
    const callsOnJanuary = async () => {
        await create();
        await setRange('2026-01-01', '2026-01-31');
        component.onExpiry('2026-01-27');
        component.onInstrument('CE');
        await settle();
    };
    const strikeSelect = () => host.querySelectorAll<HTMLSelectElement>('.control select')[0];
    const strikeTexts = () => Array.from(strikeSelect().options).map(o => o.textContent?.trim());

    afterEach(() => { vi.useRealTimers(); TestBed.resetTestingModule(); });

    it('futures need no strike: nothing is asked of dd_strikes', async () => {
        await create();
        await setRange('2026-01-01', '2026-01-31');
        expect(strikeCalls).toEqual([]);
    });

    it('an option instrument asks dd_strikes once for the selected expiry and lists exactly those strikes', async () => {
        await callsOnJanuary();
        expect(component.expiry).toBe('2026-01-27');
        expect(strikeCalls).toEqual([{ symbol: 'NIFTY', expiry: '2026-01-27' }]);
        expect(component.strikeOptions).toEqual(GRID);
        expect(strikeTexts()).toEqual(['25100', '25200', '25300', '25400']);
    });

    it('the default strike is the listed strike nearest the underlying close of the To date, not the current ATM', async () => {
        await callsOnJanuary();
        expect(underlyingCalls.at(-1)).toEqual({ symbol: 'NIFTY', till: '2026-01-31' });
        expect(component.strike).toBe(25300);                              // 25320.65 -> 25300; dd_symbol_details said 22600 for today
        expect(getEod.mock.calls.at(-1)![0]).toMatchObject({ option_type: 'CE', strike: 25300, expiry: '2026-01-27' });
    });

    it('a tie goes to the lower strike and a close between two strikes picks the nearer one', async () => {
        await create();
        underlyingFor = () => closeOn('2026-01-30', 25350);
        await setRange('2026-01-01', '2026-01-31');
        component.onExpiry('2026-01-27');
        component.onInstrument('CE');
        await settle();
        expect(component.strike).toBe(25300);
    });

    it('changing the expiry fetches that expiry\'s strikes, moves an untouched strike to its ATM and reloads the table', async () => {
        await callsOnJanuary();
        strikesFor = (_s, expiry) => (expiry === '2026-01-13' ? strikesOk([25000, 25325, 25600]) : strikesOk(GRID));
        getEod.mockClear();
        component.onExpiry('2026-01-13');
        await settle();
        expect(strikeCalls.at(-1)).toEqual({ symbol: 'NIFTY', expiry: '2026-01-13' });
        expect(component.strikeOptions).toEqual([25000, 25325, 25600]);
        expect(component.strike).toBe(25325);
        expect(getEod.mock.calls.at(-1)![0]).toMatchObject({ strike: 25325, expiry: '2026-01-13' });
        expect(getEod.mock.calls.some(call => call[0].strike === 25300 && call[0].expiry === '2026-01-13')).toBe(false);   // never the previous expiry's strike
    });

    it('the underlying close is looked up for the To date, not again when only the expiry changes', async () => {
        await callsOnJanuary();
        const before = underlyingCalls.length;
        component.onExpiry('2026-01-13');
        await settle();
        expect(underlyingCalls).toHaveLength(before);
    });

    it('a new To date asks for its close and recalculates the ATM from the same expiry\'s strikes', async () => {
        await callsOnJanuary();
        underlyingFor = (_s, till) => closeOn('2026-02-27', till === '2026-02-27' ? 25110 : 25320);
        component.onCustomTillChange('2026-02-27');
        await settle();
        expect(underlyingCalls.at(-1)).toEqual({ symbol: 'NIFTY', till: '2026-02-27' });
        expect(component.strike).toBe(25100);
    });

    it('a strike the user chose is kept when the expiry changes, and flagged when the new expiry does not list it', async () => {
        await callsOnJanuary();
        component.onStrike(25400);
        strikesFor = (_s, expiry) => (expiry === '2026-01-13' ? strikesOk([25000, 25325]) : strikesOk(GRID));
        getEod.mockClear();
        component.onExpiry('2026-01-13');
        await settle();
        expect(component.strike).toBe(25400);
        expect(strikeSelect().selectedOptions[0].textContent?.trim()).toBe('25400 (not listed for this expiry)');
        expect(getEod.mock.calls.at(-1)![0]).toMatchObject({ strike: 25400, expiry: '2026-01-13' });
    });

    it('a chosen strike that the new expiry lists is kept without a flag, and also survives a To date change', async () => {
        await callsOnJanuary();
        component.onStrike(25400);
        component.onCustomTillChange('2026-02-27');
        await settle();
        expect(component.strike).toBe(25400);
        expect(strikeSelect().selectedOptions[0].textContent?.trim()).toBe('25400');
    });

    it('while the strikes load the control is disabled with a hint and no table is requested for a strike', async () => {
        await create();
        const pending = new Subject<ExpiryStrikesResult>();
        strikesFor = () => pending;
        await setRange('2026-01-01', '2026-01-31');
        getEod.mockClear();
        component.onInstrument('CE');
        await settle();
        expect(component.strikesLoading).toBe(true);
        expect(strikeSelect().disabled).toBe(true);
        expect(host.textContent).toContain('Loading strikes for this expiry');
        expect(component.strike).toBeUndefined();
        expect(getEod).not.toHaveBeenCalled();
        pending.next({ ok: true, strikes: GRID });
        await settle();
        expect(component.strikesLoading).toBe(false);
        expect(strikeSelect().disabled).toBe(false);
        expect(component.strike).toBe(25300);
    });

    it('when the closing price cannot be loaded there is no default strike, the reason is shown, and the strikes can still be chosen', async () => {
        await create();
        underlyingFor = () => of({ ok: false, reason: 'unavailable' });
        await setRange('2026-01-01', '2026-01-31');
        component.onExpiry('2026-01-27');
        component.onInstrument('CE');
        await settle();
        expect(component.strike).toBeUndefined();
        expect(component.strikeOptions).toEqual(GRID);
        expect(host.textContent).toContain('Unable to load the closing price for 2026-01-31');
        expect(toastError).toHaveBeenCalled();
        expect(getEod.mock.calls.every(call => call[0].strike === undefined)).toBe(true);   // not even the current ATM was used
        component.onStrike(25200);
        await settle();
        expect(getEod.mock.calls.at(-1)![0]).toMatchObject({ strike: 25200 });
    });

    it('no trading session on or before the To date is reported as such', async () => {
        await create();
        underlyingFor = () => of({ ok: false, reason: 'no-session' });
        await setRange('2026-01-01', '2026-01-31');
        component.onExpiry('2026-01-27');
        component.onInstrument('CE');
        await settle();
        expect(host.textContent).toContain('No trading session was found on or before 2026-01-31');
        expect(component.strike).toBeUndefined();
    });

    it('a strike list that cannot be loaded shows an error and toast; one the backend does not list shows a note only', async () => {
        await create();
        strikesFor = () => of({ ok: false, reason: 'unavailable' });
        await setRange('2026-01-01', '2026-01-31');
        component.onExpiry('2026-01-27');
        component.onInstrument('CE');
        await settle();
        expect(host.textContent).toContain('Unable to load the strikes for this expiry.');
        expect(toastError).toHaveBeenCalledTimes(1);
        expect(component.strike).toBeUndefined();
        toastError.mockClear();
        strikesFor = () => of({ ok: false, reason: 'none' });
        component.onExpiry('2026-01-13');
        await settle();
        expect(host.textContent).toContain('No strikes are listed for this expiry.');
        expect(toastError).not.toHaveBeenCalled();
    });

    it('a late answer for an earlier expiry never overwrites the latest one', async () => {
        await create();
        const slow = new Subject<ExpiryStrikesResult>();
        strikesFor = (_s, expiry) => (expiry === '2026-01-27' ? slow : strikesOk([25000, 25325]));
        await setRange('2026-01-01', '2026-01-31');
        component.onExpiry('2026-01-27');
        component.onInstrument('CE');
        await settle();
        component.onExpiry('2026-01-13');
        await settle();
        slow.next({ ok: true, strikes: GRID });
        await settle();
        expect(component.strikeOptions).toEqual([25000, 25325]);
        expect(component.strike).toBe(25325);
    });

    it('a late closing price for an earlier To date never overwrites the latest one', async () => {
        await create();
        const slow = new Subject<HistoricalUnderlyingResult>();
        underlyingFor = (_s, till) => (till === '2026-01-31' ? slow : closeOn('2026-02-27', 25110));
        await setRange('2026-01-01', '2026-01-31');
        component.onExpiry('2026-01-27');
        component.onInstrument('CE');
        component.onCustomTillChange('2026-02-27');
        await settle();
        slow.next({ ok: true, session: '2026-01-30', underlying: 25390, strikes: [], atm: 0 });
        await settle();
        expect(component.strike).toBe(25100);
    });

    it('a symbol change drops the previous symbol\'s strikes and choice, and defaults again', async () => {
        await callsOnJanuary();
        component.onStrike(25400);
        underlyingFor = () => closeOn('2026-01-30', 59610);
        strikesFor = () => strikesOk([59500, 59600, 59700]);
        component.onSymbol('BANKNIFTY');
        await settle();
        expect(strikeCalls.at(-1)).toEqual({ symbol: 'BANKNIFTY', expiry: '2026-01-27' });
        expect(component.strikeOptions).toEqual([59500, 59600, 59700]);
        expect(component.strike).toBe(59600);
    });

    it('presets use today\'s date only as their To date: the close is looked up for it', async () => {
        await create();
        component.onInstrument('CE');
        await settle();
        expect(underlyingCalls.at(-1)).toEqual({ symbol: 'NIFTY', till: '2026-10-18' });
    });
});
