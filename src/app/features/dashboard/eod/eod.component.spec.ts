import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_RANGE_MESSAGE, minusOneYear } from '../../../shared/utils/date-range';
import { EodComponent } from './eod.component';
import { EodRequest } from './eod.model';
import { EodService } from './eod.service';

const row = { date: '2026-10-16', symbol: 'NIFTY', open: 10, high: 12, low: 9, close: 11, volume: 100, oi: 5 };

describe('EodComponent custom date range', () => {
    let fixture: ReturnType<typeof TestBed.createComponent<EodComponent>>;
    let component: EodComponent;
    let host: HTMLElement;
    const getEod = vi.fn((_: EodRequest) => of({ success: true, data: { results: [row], page: 1, has_next: false, has_previous: false } }));

    async function create(now = new Date(2026, 9, 18, 0, 30)) {
        getEod.mockClear();
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(now);
        await TestBed.configureTestingModule({
            imports: [EodComponent],
            providers: [{
                provide: EodService,
                useValue: {
                    getSymbols: () => of(['NIFTY']),
                    getDdGreeks: () => of({ success: true, data: { symbol: 'NIFTY', trade_date: '2026-10-16', expiry_date: ['2026-10-29'], underlying: 22630, strike: [22600], atm_strike: 22600, market_price: { CE: 1, PE: 1 } } }),
                    getEod,
                },
            }],
        }).compileComponents();
        fixture = TestBed.createComponent(EodComponent);
        component = fixture.componentInstance;
        host = fixture.nativeElement as HTMLElement;
        fixture.detectChanges();
        await fixture.whenStable();
        await click('.range-buttons button, button', 'Custom');
    }

    const click = async (selector: string, text: string) => {
        const node = Array.from(host.querySelectorAll<HTMLElement>(selector)).find(n => n.textContent?.trim() === text);
        expect(node, `${selector} ${text}`).toBeTruthy();
        node!.click();
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();
    };
    /** Types into a date input the way the browser does: set the value, then fire `change`. */
    const typeDate = async (id: string, value: string) => {
        const input = host.querySelector<HTMLInputElement>(`#${id}`)!;
        input.value = value;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();
    };
    const error = () => host.querySelector('.range-error')?.textContent?.trim() ?? '';

    afterEach(() => { vi.useRealTimers(); TestBed.resetTestingModule(); });

    it('uses the local calendar day for "today", so the To picker allows today (not yesterday)', async () => {
        await create(new Date(2026, 9, 18, 0, 30));      // 00:30 local: toISOString() would say the 17th east of UTC
        expect(component.todayStr).toBe('2026-10-18');
        expect(component.customTill).toBe('2026-10-18');
        expect(component.customFrom).toBe('2026-10-11');
        expect(host.querySelector<HTMLInputElement>('#eod-till')!.max).toBe('2026-10-18');
        expect(host.querySelector<HTMLInputElement>('#eod-from')!.max).toBe('2026-10-18');
    });

    it('limits the pickers to one year: From min follows To, To max follows From', async () => {
        await create();
        const from = host.querySelector<HTMLInputElement>('#eod-from')!;
        const till = host.querySelector<HTMLInputElement>('#eod-till')!;
        expect(from.min).toBe('2025-10-18');                       // one year before the To date
        await typeDate('eod-from', '2026-03-01');
        expect(till.max).toBe('2026-10-18');                       // From + 1 year would be after today
        await typeDate('eod-from', '2025-10-18');
        expect(till.max).toBe('2026-10-18');
        await typeDate('eod-till', '2026-06-01');
        expect(from.min).toBe(minusOneYear('2026-06-01'));
        expect(till.max).toBe('2026-10-18');                       // From (18 Oct 2025) + 1 year, equal to today here
    });

    it('accepts exactly one year and rejects a day more, without requesting data', async () => {
        await create();
        getEod.mockClear();
        await typeDate('eod-from', '2025-10-17');
        expect(error()).toBe(MAX_RANGE_MESSAGE);
        expect(getEod).not.toHaveBeenCalled();
        await typeDate('eod-from', '2025-10-18');
        expect(error()).toBe('');
        expect(getEod).toHaveBeenCalledTimes(1);
        expect(getEod.mock.calls[0][0]).toMatchObject({ date_from: '2025-10-18', date_till: '2026-10-18' });
    });

    it('keeps the data on screen when a range is rejected, and recovers when it is fixed', async () => {
        await create();
        expect(component.rows).toHaveLength(1);
        await typeDate('eod-from', '2024-01-01');
        expect(error()).toBe(MAX_RANGE_MESSAGE);
        expect(component.rows).toHaveLength(1);
        await typeDate('eod-from', '2026-10-01');
        expect(error()).toBe('');
    });

    it('validates manually entered dates: malformed, reversed and future ones never request data', async () => {
        await create();
        getEod.mockClear();
        component.onCustomFromChange('2026-02-31');           // a date input itself blanks impossible dates, so call the handler directly
        expect(component.error).toBe('Enter valid dates');
        await typeDate('eod-from', '2026-10-17');
        await typeDate('eod-till', '2026-10-10');
        expect(error()).toBe('Start date cannot be after end date');
        await typeDate('eod-till', '2026-10-25');
        expect(error()).toBe('Dates cannot be in the future');
        expect(getEod.mock.calls.every(([r]) => r.date_till <= '2026-10-18' && r.date_from <= r.date_till)).toBe(true);
        expect(getEod).toHaveBeenCalledTimes(1);                   // only the valid 17 Oct → 18 Oct range
    });

    it('handles a leap-day start: 29 Feb 2024 to 28 Feb 2025 is allowed, 1 Mar 2025 is not', async () => {
        await create(new Date(2026, 9, 18, 12, 0));
        getEod.mockClear();
        await typeDate('eod-till', '2025-02-28');
        await typeDate('eod-from', '2024-02-29');
        expect(error()).toBe('');
        expect(getEod.mock.calls.at(-1)![0]).toMatchObject({ date_from: '2024-02-29', date_till: '2025-02-28' });
        const calls = getEod.mock.calls.length;
        await typeDate('eod-till', '2025-03-01');
        expect(error()).toBe(MAX_RANGE_MESSAGE);
        expect(getEod.mock.calls.length).toBe(calls);
    });

    it('leaves the presets alone: 1W still requests a fixed week without custom validation', async () => {
        await create();
        getEod.mockClear();
        await click('button', '1M');
        const req = getEod.mock.calls.at(-1)![0];
        expect(req.date_till).toBe('2026-10-18');
        expect(req.date_from).toBe('2026-09-18');
        expect(host.querySelector('#eod-from')).toBeNull();
    });
});
