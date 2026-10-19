import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
                    getEodChart: () => of({ success: true, data: [] }),
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

    const value = (id: string) => host.querySelector<HTMLInputElement>(`#${id}`)!.value;

    it('never blocks a chosen date with the other one: pickers only narrow an EMPTY date', async () => {
        await create();
        const from = host.querySelector<HTMLInputElement>('#eod-from')!;
        const till = host.querySelector<HTMLInputElement>('#eod-till')!;
        expect([from.min, from.max, till.min, till.max]).toEqual(['', '2026-10-18', '', '2026-10-18']);   // both set: only "not in the future"
        await typeDate('eod-from', '2025-01-01');                  // over a year before To: accepted, To cleared
        expect(value('eod-from')).toBe('2025-01-01');
        expect(value('eod-till')).toBe('');
        expect([till.min, till.max]).toEqual(['2025-01-01', '2026-01-01']);      // the empty To is narrowed to From .. From + 1 year
        await typeDate('eod-from', '');                            // From emptied too: both empty, so unrestricted but for today
        await typeDate('eod-till', '2026-06-01');
        expect(value('eod-till')).toBe('2026-06-01');
        expect([from.min, from.max]).toEqual(['2025-06-01', '2026-06-01']);      // the empty From is narrowed to To - 1 year .. To
    });

    it('changing From keeps a To that still fits, and clears one that is earlier or over a year later', async () => {
        await create();
        getEod.mockClear();
        await typeDate('eod-from', '2026-10-05');                  // fits: To stays, data requested
        expect(value('eod-till')).toBe('2026-10-18');
        expect(getEod).toHaveBeenCalledTimes(1);
        expect(getEod.mock.calls[0][0]).toMatchObject({ date_from: '2026-10-05', date_till: '2026-10-18' });
        expect(error()).toBe('');

        await typeDate('eod-from', '2025-10-18');                  // exactly one year before To: allowed
        expect(value('eod-till')).toBe('2026-10-18');
        expect(getEod).toHaveBeenCalledTimes(2);

        await typeDate('eod-from', '2025-10-17');                  // one day over: To cleared, message, no request
        expect(value('eod-from')).toBe('2025-10-17');
        expect(value('eod-till')).toBe('');
        expect(error()).toContain('The To date was cleared because it was more than one year after the new From date');
        expect(getEod).toHaveBeenCalledTimes(2);

        await typeDate('eod-till', '2026-10-17');                  // the user picks To again: exactly one year, request
        expect(error()).toBe('');
        expect(getEod).toHaveBeenCalledTimes(3);
        expect(getEod.mock.calls[2][0]).toMatchObject({ date_from: '2025-10-17', date_till: '2026-10-17' });

        await typeDate('eod-from', '2026-10-17');                  // later than nothing else, equal to To: fits (a single day)
        expect(value('eod-till')).toBe('2026-10-17');
        component.onCustomFromChange('2026-10-18');                // after To: To cleared
        expect(component.customTill).toBe('');
        expect(component.error).toContain('before the new From date');
    });

    it('changing To clears a From that is after it or more than a year before it', async () => {
        await create();
        getEod.mockClear();
        await typeDate('eod-till', '2026-10-12');                  // From (11 Oct) still fits
        expect(value('eod-from')).toBe('2026-10-11');
        expect(getEod).toHaveBeenCalledTimes(1);

        await typeDate('eod-till', '2026-10-01');                  // From (11 Oct) is now after To: cleared
        expect(value('eod-from')).toBe('');
        expect(value('eod-till')).toBe('2026-10-01');
        expect(error()).toContain('The From date was cleared because it was after the new To date');
        expect(getEod).toHaveBeenCalledTimes(1);                   // incomplete range: no request

        await typeDate('eod-from', '2025-10-01');                  // exactly one year before To: allowed
        expect(error()).toBe('');
        expect(getEod).toHaveBeenCalledTimes(2);

        await typeDate('eod-till', '2026-10-02');                  // From is now one day too far back: cleared
        expect(value('eod-from')).toBe('');
        expect(error()).toContain('more than one year before the new To date');
        expect(getEod).toHaveBeenCalledTimes(2);
    });

    it('keeps the data on screen while a range is incomplete or invalid, and recovers when completed', async () => {
        await create();
        expect(component.rows).toHaveLength(1);
        await typeDate('eod-from', '2024-01-01');                  // To cleared
        expect(component.rows).toHaveLength(1);
        await typeDate('eod-till', '2024-06-01');
        expect(error()).toBe('');
    });

    it('handles leap days and month ends at the boundary', async () => {
        await create(new Date(2026, 9, 18, 12, 0));
        getEod.mockClear();
        await typeDate('eod-till', '2025-02-28');                  // From (11 Oct 2026) is after it: cleared
        expect(value('eod-from')).toBe('');
        await typeDate('eod-from', '2024-02-29');                  // 29 Feb 2024 + 1 year = 28 Feb 2025: allowed
        expect(value('eod-till')).toBe('2025-02-28');
        expect(getEod).toHaveBeenCalledTimes(1);
        expect(getEod.mock.calls[0][0]).toMatchObject({ date_from: '2024-02-29', date_till: '2025-02-28' });
        await typeDate('eod-from', '2024-02-28');                  // 28 Feb 2024 + 1 year = 28 Feb 2025: allowed
        expect(value('eod-till')).toBe('2025-02-28');
        await typeDate('eod-till', '2025-03-01');                  // a day past: From cleared
        expect(value('eod-from')).toBe('');
        await typeDate('eod-from', '2024-03-01');                  // 1 Mar 2024 + 1 year = 1 Mar 2025: allowed
        expect(value('eod-till')).toBe('2025-03-01');
        await typeDate('eod-till', '2026-01-31');
        await typeDate('eod-from', '2025-01-31');                  // month end, exactly one year
        expect(value('eod-till')).toBe('2026-01-31');
        await typeDate('eod-from', '2025-01-30');
        expect(value('eod-till')).toBe('');
    });

    it('still validates what is left: impossible dates and future dates never request data', async () => {
        await create();
        getEod.mockClear();
        component.onCustomFromChange('2026-02-31');                // a date input blanks these itself; the handler guards anyway
        expect(component.error).toBe('Enter valid dates');
        await typeDate('eod-from', '2026-10-17');
        await typeDate('eod-till', '2026-10-25');
        expect(error()).toBe('Dates cannot be in the future');
        expect(getEod).toHaveBeenCalledTimes(1);                   // only the valid 17 Oct → 18 Oct range from the first change
    });

    it('leaves the presets alone', async () => {
        await create();
        getEod.mockClear();
        await click('button', '1M');
        const req = getEod.mock.calls.at(-1)![0];
        expect(req.date_till).toBe('2026-10-18');
        expect(req.date_from).toBe('2026-09-18');
        expect(host.querySelector('#eod-from')).toBeNull();
    });
});
