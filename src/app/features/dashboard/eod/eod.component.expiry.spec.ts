import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastService } from '../../../core/services/toast.service';
import { EodComponent } from './eod.component';
import { DdExpiryRequest, DdExpiryResponse, EodRequest } from './eod.model';
import { EodService } from './eod.service';
import { ExpiryStrikesService } from './expiry-strikes.service';
import { HistoricalUnderlyingService } from './historical-underlying.service';

// What the backend returns for a January 2026 window: every expiry alive in it, including later ones.
const JAN_2026 = ['2026-01-06', '2026-01-13', '2026-01-20', '2026-01-27', '2026-02-03', '2026-02-10', '2026-02-17', '2026-02-24', '2026-03-02', '2026-03-30', '2026-04-28', '2026-06-30'];
const row = { date: '2026-01-16', symbol: 'NIFTY', open: 10, high: 12, low: 9, close: 11, volume: 100, oi: 5 };

describe('EodComponent expiry list (selected dates, not today)', () => {
    let fixture: ReturnType<typeof TestBed.createComponent<EodComponent>>;
    let component: EodComponent;
    let host: HTMLElement;
    let calls: DdExpiryRequest[];
    let expiryFor: (req: DdExpiryRequest) => Observable<DdExpiryResponse>;
    const toastError = vi.fn();
    const getEodChart = vi.fn((_: unknown) => of({ success: true, data: [] }));
    const getEod = vi.fn((_: EodRequest) => of({ success: true, data: { results: [row], page: 1, has_next: false, has_previous: false } }));
    const reply = (dates: string[]) => (req: DdExpiryRequest) => of({ success: true, data: { symbol: req.symbol, trade_from: req.trade_from, trade_till: req.trade_till, expiry_date: dates } });
    const noData = () => throwError(() => new HttpErrorResponse({ status: 422, error: { success: false, errors: { expiry_date: ['No data available.'] } } }));

    // The system clock is deliberately far from the dates under test: the list must follow the selection, not today.
    async function create(symbol = 'NIFTY') {
        calls = [];
        expiryFor = reply(JAN_2026);
        getEod.mockClear();
        getEodChart.mockClear();
        toastError.mockClear();
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date(2026, 9, 18, 12, 0));
        await TestBed.configureTestingModule({
            imports: [EodComponent],
            providers: [
                { provide: HistoricalUnderlyingService, useValue: { resolve: () => of({ ok: true, session: '2026-10-16', underlying: 22630, strikes: [22600], atm: 22600 }) } },
                { provide: ExpiryStrikesService, useValue: { resolve: () => of({ ok: true, strikes: [22600] }) } },
                { provide: ToastService, useValue: { error: toastError, success: vi.fn(), info: vi.fn() } },
                {
                    provide: EodService,
                    useValue: {
                        getSymbols: () => of(['NIFTY', 'BANKNIFTY', 'RELIANCE']),
                        getDdGreeks: ({ symbol: s }: { symbol: string }) => of({ success: true, data: { symbol: s, trade_date: '2026-10-16', expiry_date: ['2026-10-20', '2026-11-24'], underlying: 22630, strike: [22600], atm_strike: 22600, market_price: { CE: 1, PE: 1 } } }),
                        getDdExpiry: (req: DdExpiryRequest) => { calls.push(req); return expiryFor(req); },
                        getEod,
                        getEodChart,
                    },
                },
            ],
        }).compileComponents();
        fixture = TestBed.createComponent(EodComponent);
        component = fixture.componentInstance;
        host = fixture.nativeElement as HTMLElement;
        void symbol;
        await settle();
    }
    const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
    const setRange = async (from: string, till: string) => {
        component.onRange('Custom');
        component.onCustomFromChange(from);
        component.onCustomTillChange(till);
        await settle();
    };
    const optionValues = () => Array.from(host.querySelectorAll<HTMLOptionElement>('.control select option')).filter(o => /^\d{4}-\d{2}-\d{2}$/.test(o.value)).map(o => o.value);

    afterEach(() => { vi.useRealTimers(); TestBed.resetTestingModule(); });

    it('loads from dd_expiry, not from the current-date list of dd_symbol_details', async () => {
        await create();
        expect(calls).toHaveLength(1);
        expect(component.expiryOptions).not.toContain('2026-11-24');   // dd_symbol_details lists it; the range answer does not
    });

    it('Jan 2026: sends the symbol, From and To as given; lists every expiry the API returns, historical and after To', async () => {
        await create();
        await setRange('2026-01-01', '2026-01-31');
        expect(calls.at(-1)).toEqual({ symbol: 'NIFTY', trade_from: '2026-01-01', trade_till: '2026-01-31' });
        expect(component.expiryOptions).toEqual(JAN_2026);
    });

    it('dates after To are retained, not filtered out', async () => {
        await create();
        await setRange('2026-01-01', '2026-01-31');
        expect(component.expiryOptions).toContain('2026-02-24');
        expect(component.expiryOptions).toContain('2026-06-30');
        expect(component.expiryOptions.at(-1)).toBe('2026-06-30');
    });

    it('the request carries From and To; the answer is shown whole', async () => {
        await create();
        await setRange('2026-01-13', '2026-01-27');
        expect(calls.at(-1)).toEqual({ symbol: 'NIFTY', trade_from: '2026-01-13', trade_till: '2026-01-27' });
        expect(component.expiryOptions).toEqual(JAN_2026);
    });

    it('the list is unique and ascending', async () => {
        await create();
        expiryFor = reply(['2026-01-27', '2026-01-06', '2026-01-27', '2026-01-13']);
        await setRange('2026-01-01', '2026-01-31');
        expect(component.expiryOptions).toEqual(['2026-01-06', '2026-01-13', '2026-01-27']);
    });

    it('shows the options in the Expiry control for an option instrument', async () => {
        await create();
        component.onInstrument('CE');
        await setRange('2026-01-01', '2026-01-31');
        expect(optionValues()).toEqual(JAN_2026);
    });

    it('changing From or To refreshes the list; the same dates are not requested twice', async () => {
        await create();
        await setRange('2026-01-01', '2026-01-31');
        const before = calls.length;
        component.onCustomTillChange('2026-01-31');
        await settle();
        expect(calls).toHaveLength(before);
        expiryFor = reply(JAN_2026);
        component.onCustomTillChange('2026-02-20');
        await settle();
        expect(calls.at(-1)).toEqual({ symbol: 'NIFTY', trade_from: '2026-01-01', trade_till: '2026-02-20' });
        expect(component.expiryOptions).toContain('2026-02-17');
        expect(component.expiryOptions).toContain('2026-04-28');       // beyond To, kept
    });

    it('presets use their own dates and the current day only because To is "today" for them', async () => {
        await create();
        component.onRange('1M');
        await settle();
        expect(calls.at(-1)).toEqual({ symbol: 'NIFTY', trade_from: '2026-09-18', trade_till: '2026-10-18' });
    });

    it('a symbol change asks again for the new symbol with the same dates', async () => {
        await create();
        await setRange('2026-01-01', '2026-01-31');
        calls.length = 0;
        component.onSymbol('BANKNIFTY');
        await settle();
        expect(calls).toEqual([{ symbol: 'BANKNIFTY', trade_from: '2026-01-01', trade_till: '2026-01-31' }]);
    });

    it('no request while the custom dates are incomplete, reversed or in the future', async () => {
        await create();
        await setRange('2026-01-01', '2026-01-31');
        calls.length = 0;
        component.onCustomTillChange('');
        await settle();
        component.onCustomTillChange('2999-01-01');
        await settle();
        expect(calls).toHaveLength(0);
    });

    it('keeps the selected expiry while it is still offered; once it is gone, picks the most recent one inside the dates', async () => {
        await create();
        component.onInstrument('CE');
        await setRange('2026-01-01', '2026-01-31');
        component.onExpiry('2026-01-13');
        component.onCustomFromChange('2026-01-05');
        await settle();
        expect(component.expiry).toBe('2026-01-13');                   // still offered: kept
        expiryFor = reply(['2026-01-20', '2026-01-27', '2026-02-24']);
        component.onCustomFromChange('2026-01-14');
        await settle();
        expect(component.expiry).toBe('2026-01-27');                   // 2026-01-13 dropped out: most recent inside the range
    });

    it('with no expiry inside the dates the dates after To are still offered and the earliest becomes the default', async () => {
        await create();
        component.onInstrument('CE');
        await setRange('2026-01-28', '2026-01-30');
        expect(component.expiryOptions).toEqual(JAN_2026);
        expect(component.expiry).toBe('2026-01-06');
    });

    it('a changed option expiry reloads the table with it', async () => {
        await create();
        component.onInstrument('CE');
        await setRange('2026-01-01', '2026-01-31');
        component.onExpiry('2026-01-27');
        await settle();
        expect(getEod.mock.calls.at(-1)![0]).toMatchObject({ option_type: 'CE', expiry: '2026-01-27' });
    });

    it('the backend\'s 422 "No data available." is an empty list with an accurate note, not an error toast', async () => {
        await create();
        expiryFor = noData;
        await setRange('2000-01-01', '2000-02-01');
        expect(component.expiryOptions).toEqual([]);
        expect(component.expiry).toBeUndefined();
        expect(component.expiryNote).toBe('No expiries are listed for these dates.');
        expect(toastError).not.toHaveBeenCalled();
    });

    it('any other failure (including another 422) is an error: note and toast, no invented dates', async () => {
        await create();
        expiryFor = () => throwError(() => new HttpErrorResponse({ status: 422, error: { errors: { trade_from: ['Invalid.'] } } }));
        await setRange('2026-01-01', '2026-01-31');
        expect(component.expiryOptions).toEqual([]);
        expect(component.expiryNote).toBe('Unable to load expiries for these dates.');
        expect(toastError).toHaveBeenCalled();
        expiryFor = () => throwError(() => new HttpErrorResponse({ status: 500 }));
        component.onCustomTillChange('2026-01-30');
        await settle();
        expect(component.expiryNote).toBe('Unable to load expiries for these dates.');
    });

    it('an empty or malformed response is safe', async () => {
        await create();
        expiryFor = reply([]);
        await setRange('2026-01-01', '2026-01-31');
        expect(component.expiryOptions).toEqual([]);
        expect(component.expiryNote).toBe('No expiries are listed for these dates.');
        expiryFor = () => of({ success: true, data: undefined } as unknown as DdExpiryResponse);
        component.onCustomTillChange('2026-01-30');
        await settle();
        expect(component.expiryOptions).toEqual([]);
    });

    it('the Expiry control is disabled and a hint shows while the list loads', async () => {
        await create();
        component.onInstrument('CE');
        const pending = new Subject<DdExpiryResponse>();
        expiryFor = () => pending;
        await setRange('2026-01-01', '2026-01-31');
        expect(component.expiryLoading).toBe(true);
        expect(host.querySelector<HTMLSelectElement>('.control select[disabled]')).toBeTruthy();
        expect(host.textContent).toContain('Loading expiries for these dates');
        pending.next({ success: true, data: { symbol: 'NIFTY', trade_from: '2026-01-01', trade_till: '2026-01-31', expiry_date: JAN_2026 } });
        await settle();
        expect(component.expiryLoading).toBe(false);
    });

    it('a slow answer for earlier dates or another symbol never overwrites the latest list', async () => {
        await create();
        const slow = new Subject<DdExpiryResponse>();
        expiryFor = req => (req.trade_till === '2026-01-31' ? slow : reply(['2026-02-24'])(req));
        await setRange('2026-01-01', '2026-01-31');
        component.onCustomTillChange('2026-02-27');
        await settle();
        slow.next({ success: true, data: { symbol: 'NIFTY', trade_from: '2026-01-01', trade_till: '2026-01-31', expiry_date: ['2026-01-27'] } });
        await settle();
        expect(component.expiryOptions).toEqual(['2026-02-24']);
        const slowSymbol = new Subject<DdExpiryResponse>();
        expiryFor = req => (req.symbol === 'BANKNIFTY' ? slowSymbol : reply(['2026-02-10', '2026-02-24', '2026-03-30'])(req));
        component.onSymbol('BANKNIFTY');
        await settle();
        component.onSymbol('RELIANCE');
        await settle();
        slowSymbol.next({ success: true, data: { symbol: 'BANKNIFTY', trade_from: '', trade_till: '', expiry_date: ['2026-02-24'] } });
        await settle();
        expect(component.symbol).toBe('RELIANCE');
        expect(component.expiryOptions).toEqual(['2026-02-10', '2026-02-24', '2026-03-30']);
    });

    describe('table and chart requests while the expiry list refreshes', () => {
        const slowFor = (slow: Subject<DdExpiryResponse>, dates: string[]) => (req: DdExpiryRequest) => (req.trade_till === '2026-02-27' ? slow : reply(dates)(req));
        const optionsOnJanuary = async () => {
            await create();
            await setRange('2026-01-01', '2026-01-31');
            component.onExpiry('2026-01-27');
            component.onInstrument('CE');
            await settle();
        };
        const answer = (slow: Subject<DdExpiryResponse>, dates: string[]) => {
            slow.next({ success: true, data: { symbol: 'NIFTY', trade_from: '2026-01-01', trade_till: '2026-02-27', expiry_date: dates } });
            return settle();
        };

        it('a date change requests neither the table nor the chart with the old expiry; both follow the refreshed list', async () => {
            await optionsOnJanuary();
            const slow = new Subject<DdExpiryResponse>();
            expiryFor = slowFor(slow, []);
            getEod.mockClear();
            getEodChart.mockClear();
            component.onCustomTillChange('2026-02-27');
            await settle();
            expect(getEod).not.toHaveBeenCalled();
            expect(getEodChart).not.toHaveBeenCalled();
            expect(component.loading).toBe(true);                    // still loading, not an empty table
            await answer(slow, ['2026-02-03', '2026-02-24']);
            expect(getEod.mock.calls.map(call => call[0].expiry)).toEqual(['2026-02-24']);
            expect(getEodChart.mock.calls.map(call => (call[0] as { expiry: string }).expiry)).toEqual(['2026-02-24']);
            expect(component.loading).toBe(false);
        });

        it('a still valid expiry is kept and the held request is sent with it once the list answers', async () => {
            await optionsOnJanuary();
            const slow = new Subject<DdExpiryResponse>();
            expiryFor = slowFor(slow, []);
            getEod.mockClear();
            component.onCustomTillChange('2026-02-27');
            await settle();
            await answer(slow, ['2026-01-27', '2026-02-24']);
            expect(component.expiry).toBe('2026-01-27');
            expect(getEod).toHaveBeenCalledTimes(1);
            expect(getEod.mock.calls[0][0]).toMatchObject({ option_type: 'CE', expiry: '2026-01-27', date_till: '2026-02-27' });
        });

        it('a chosen strike is kept through the refresh', async () => {
            await optionsOnJanuary();
            component.onStrike(22600);
            const slow = new Subject<DdExpiryResponse>();
            expiryFor = slowFor(slow, []);
            component.onCustomTillChange('2026-02-27');
            await settle();
            await answer(slow, ['2026-02-24']);
            expect(component.strike).toBe(22600);
            expect(getEod.mock.calls.at(-1)![0]).toMatchObject({ strike: 22600, expiry: '2026-02-24' });
        });

        it('a late list for earlier dates is dropped: only the latest expiry is ever requested', async () => {
            await optionsOnJanuary();
            const first = new Subject<DdExpiryResponse>();
            const second = new Subject<DdExpiryResponse>();
            expiryFor = req => (req.trade_till === '2026-02-27' ? first : second);
            getEod.mockClear();
            component.onCustomTillChange('2026-02-27');
            await settle();
            component.onCustomTillChange('2026-03-02');
            await settle();
            first.next({ success: true, data: { symbol: 'NIFTY', trade_from: '', trade_till: '', expiry_date: ['2026-02-24'] } });
            await settle();
            expect(getEod).not.toHaveBeenCalled();
            second.next({ success: true, data: { symbol: 'NIFTY', trade_from: '', trade_till: '', expiry_date: ['2026-03-24'] } });
            await settle();
            expect(getEod.mock.calls.map(call => call[0].expiry)).toEqual(['2026-03-24']);
        });

        it('a failed list sends no table request with the old expiry and leaves nothing loading', async () => {
            await optionsOnJanuary();
            expiryFor = () => throwError(() => new HttpErrorResponse({ status: 500 }));
            getEod.mockClear();
            component.onCustomTillChange('2026-02-27');
            await settle();
            expect(getEod.mock.calls.every(call => call[0].expiry === undefined)).toBe(true);
            expect(component.loading).toBe(false);
            expect(component.expiryNote).toBe('Unable to load expiries for these dates.');
        });

        it('dates that become invalid while the list loads do not leave the table loading', async () => {
            await optionsOnJanuary();
            const slow = new Subject<DdExpiryResponse>();
            expiryFor = slowFor(slow, []);
            component.onCustomTillChange('2026-02-27');
            await settle();
            expect(component.loading).toBe(true);
            component.onCustomTillChange('');
            await settle();
            expect(component.loading).toBe(false);
        });

        it('futures have no expiry to wait for: a date change requests the table at once', async () => {
            await create();
            await setRange('2026-01-01', '2026-01-31');
            const slow = new Subject<DdExpiryResponse>();
            expiryFor = slowFor(slow, []);
            getEod.mockClear();
            component.onCustomTillChange('2026-02-27');
            await settle();
            expect(getEod).toHaveBeenCalledTimes(1);
            expect(getEod.mock.calls[0][0]).toMatchObject({ option_type: 'XX', date_till: '2026-02-27' });
        });

        it('changing only the option type or expiry (no new dates) is not held', async () => {
            await optionsOnJanuary();
            getEod.mockClear();
            component.onExpiry('2026-01-13');
            await settle();
            expect(getEod.mock.calls.at(-1)![0]).toMatchObject({ expiry: '2026-01-13' });
        });
    });

    describe('loading indicator in the Expiry control', () => {
        it('a refreshing list shows a spinner inside the control and no text line below it; the control is disabled meanwhile', async () => {
            await create();
            component.onInstrument('CE');
            await settle();
            const slow = new Subject<DdExpiryResponse>();
            expiryFor = () => slow;
            component.onRange('Custom');
            component.onCustomFromChange('2026-01-01');
            component.onCustomTillChange('2026-02-27');
            await settle();
            const select = host.querySelectorAll<HTMLSelectElement>('.control select')[1];
            const control = select.closest('.control')!;
            expect(control.querySelector('.select-wrap .select-spinner')).toBeTruthy();
            expect(control.querySelector('.field-hint')).toBeNull();
            expect(select.disabled).toBe(true);
            slow.next({ success: true, data: { symbol: 'NIFTY', trade_from: '', trade_till: '', expiry_date: ['2026-02-24'] } });
            await settle();
            expect(control.querySelector('.select-spinner')).toBeNull();
            expect(select.disabled).toBe(false);
        });

        it('a failed list removes the spinner and keeps the note and toast', async () => {
            await create();
            component.onInstrument('CE');
            expiryFor = () => throwError(() => new HttpErrorResponse({ status: 500 }));
            await setRange('2026-01-01', '2026-01-31');
            expect(host.querySelector('.select-spinner')).toBeNull();
            expect(host.textContent).toContain('Unable to load expiries for these dates.');
            expect(toastError).toHaveBeenCalled();
        });
    });
});
