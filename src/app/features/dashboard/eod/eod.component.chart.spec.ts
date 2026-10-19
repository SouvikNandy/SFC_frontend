import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EodComponent } from './eod.component';
import { EodChartPoint, EodChartRequest, EodChartResponse, EodRequest } from './eod.model';
import { EodService } from './eod.service';
import { readChartPoints } from './eod-chart-points.util';

const NOW = new Date(2026, 9, 19, 12, 0);
const tableRow = (n: number) => ({ date: `2026-10-${String(n).padStart(2, '0')}`, symbol: 'NIFTY', open: 10, high: 12, low: 9, close: 11 + n, volume: 100, oi: 5 });

/** `count` consecutive daily points, oldest first, like the API. */
const series = (count: number, base = 20000): EodChartPoint[] => Array.from({ length: count }, (_, i) => ({
    date: new Date(Date.UTC(2025, 10, 1 + i)).toISOString().slice(0, 10),
    close: base + i,
}));
const ok = (data: EodChartPoint[]): Observable<EodChartResponse> => of({ success: true, message: 'EOD_CHART_FETCHED', data });

describe('EodComponent chart (/fo/eod/chart)', () => {
    let fixture: ReturnType<typeof TestBed.createComponent<EodComponent>>;
    let component: EodComponent;
    let host: HTMLElement;
    let chartImpl: (request: EodChartRequest) => Observable<EodChartResponse>;
    let hasNext = true;
    const getEod = vi.fn((r: EodRequest) => of({ success: true, data: { results: [tableRow(14), tableRow(15), tableRow(16)], page: r.page, has_next: hasNext, has_previous: r.page > 1 } }));
    const getEodChart = vi.fn((r: EodChartRequest) => chartImpl(r));

    async function create(impl: typeof chartImpl = () => ok(series(300))) {
        getEod.mockClear();
        getEodChart.mockClear();
        chartImpl = impl;
        hasNext = true;
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(NOW);
        await TestBed.configureTestingModule({
            imports: [EodComponent],
            providers: [{
                provide: EodService,
                useValue: {
                    getSymbols: () => of(['NIFTY', 'BANKNIFTY']),
                    getDdGreeks: () => of({ success: true, data: { symbol: 'NIFTY', trade_date: '2026-10-16', expiry_date: ['2026-10-29'], underlying: 22630, strike: [22600], atm_strike: 22600, market_price: { CE: 1, PE: 1 } } }),
                    getEod,
                    getEodChart,
                },
            }],
        }).compileComponents();
        fixture = TestBed.createComponent(EodComponent);
        component = fixture.componentInstance;
        host = fixture.nativeElement as HTMLElement;
        await settle();
    }
    const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
    const click = async (text: string) => {
        const node = Array.from(host.querySelectorAll<HTMLElement>('button')).find(n => n.textContent?.trim() === text);
        expect(node, `button ${text}`).toBeTruthy();
        node!.click();
        await settle();
    };
    const chartText = () => host.querySelector('.chart-card')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

    afterEach(() => { vi.useRealTimers(); TestBed.resetTestingModule(); });

    it('draws the whole selected range from /fo/eod/chart, not the table page', async () => {
        await create();
        expect(getEodChart).toHaveBeenCalledTimes(1);
        expect(getEodChart.mock.calls[0][0]).toEqual({ symbol: 'NIFTY', option_type: 'XX', date_from: '2026-10-12', date_till: '2026-10-19' });
        expect(Object.keys(getEodChart.mock.calls[0][0])).not.toContain('page');
        expect(component.rows).toHaveLength(3);                                  // the table page
        expect(component.chartPoints).toHaveLength(300);                         // every returned point
        expect(component.chart!.points).toHaveLength(300);                       // and every one drawn
        expect(host.querySelector('.chart svg path[stroke-width="2.5"]')).toBeTruthy();
    });

    it('keeps every point, including a long flat stretch (nothing is thinned or filtered)', async () => {
        const flat = series(60).map(p => ({ ...p, close: 1510.7 }));
        await create(() => ok([...flat, ...series(40, 1000)]));
        expect(component.chart!.points).toHaveLength(100);
    });

    it('does not re-request the chart for paging or page size, but still pages the table', async () => {
        await create();
        await click('Next');
        expect(getEod).toHaveBeenCalledTimes(2);
        expect(getEod.mock.calls[1][0].page).toBe(2);
        component.onPageSizeChange({ target: { value: '25' } } as unknown as Event);
        await settle();
        expect(getEod).toHaveBeenCalledTimes(3);
        expect(getEodChart).toHaveBeenCalledTimes(1);
        expect(component.chartPoints).toHaveLength(300);
    });

    it('requests the chart with the same filters as the table when option type, strike, expiry or dates change', async () => {
        await create();
        await click('Call');
        const table = getEod.mock.calls.at(-1)![0];
        const chart = getEodChart.mock.calls.at(-1)![0];
        expect(chart).toEqual({ symbol: 'NIFTY', option_type: 'CE', strike: 22600, expiry: '2026-10-29', date_from: table.date_from, date_till: table.date_till });
        await click('Put');
        expect(getEodChart.mock.calls.at(-1)![0]).toMatchObject({ option_type: 'PE', strike: 22600, expiry: '2026-10-29' });
        await click('1M');
        expect(getEod.mock.calls.at(-1)![0].date_from).toBe('2026-09-19');
        expect(getEodChart.mock.calls.at(-1)![0]).toMatchObject({ option_type: 'PE', date_from: '2026-09-19', date_till: '2026-10-19' });
        await click('Futures');
        expect(getEodChart.mock.calls.at(-1)![0]).toEqual({ symbol: 'NIFTY', option_type: 'XX', date_from: '2026-09-19', date_till: '2026-10-19' });
    });

    it('does not repeat an identical chart request (same preset clicked again)', async () => {
        await create();
        await click('1W');
        await click('1W');
        expect(getEodChart).toHaveBeenCalledTimes(1);
        expect(getEod.mock.calls.length).toBeGreaterThan(1);                      // the table still refreshes as before
    });

    it('shows only the latest selection when responses arrive out of order', async () => {
        const pending: Array<{ request: EodChartRequest; reply: Subject<EodChartResponse> }> = [];
        await create((request) => {
            if (request.option_type === 'XX') return ok(series(10, 100));
            const reply = new Subject<EodChartResponse>();
            pending.push({ request, reply });
            return reply;
        });
        await click('Call');
        await click('Put');
        expect(pending.map(p => p.request.option_type)).toEqual(['CE', 'PE']);
        expect(host.textContent).toContain('Loading chart…');
        expect(component.chart).toBeNull();                                      // no stale chart while loading
        pending[1].reply.next({ success: true, data: series(5, 900) });          // the current (PE) answer arrives first
        pending[1].reply.complete();
        await settle();
        expect(component.chartPoints.map(p => p.close)).toEqual([900, 901, 902, 903, 904]);
        pending[0].reply.next({ success: true, data: series(7, 100) });          // the superseded (CE) answer arrives late
        pending[0].reply.complete();
        await settle();
        expect(component.chartPoints.map(p => p.close)).toEqual([900, 901, 902, 903, 904]);
    });

    it('a symbol change drops the old chart and the late response of the old symbol', async () => {
        const late = new Subject<EodChartResponse>();
        let first = true;
        await create(() => { if (first) { first = false; return late; } return ok(series(4, 500)); });
        expect(host.textContent).toContain('Loading chart…');
        component.selectSymbol('BANKNIFTY');
        await settle();
        expect(getEodChart.mock.calls.at(-1)![0].symbol).toBe('BANKNIFTY');
        expect(component.chartPoints.map(p => p.close)).toEqual([500, 501, 502, 503]);
        late.next({ success: true, data: series(9, 1) });
        late.complete();
        await settle();
        expect(component.chartPoints.map(p => p.close)).toEqual([500, 501, 502, 503]);
    });

    it('shows a chart-specific error with Retry, leaves the table working, and Retry recovers', async () => {
        let fail = true;
        await create(() => (fail ? throwError(() => new Error('500')) : ok(series(20))));
        expect(chartText()).toContain('Unable to load the chart.');
        expect(host.querySelector('.btn-retry')).toBeTruthy();
        expect(component.rows).toHaveLength(3);                                  // the table is unaffected
        expect(component.error).toBe('');
        expect(host.querySelector('.chart svg')).toBeNull();                     // no partial or fallback chart from table rows
        fail = false;
        await click('Retry');
        expect(getEodChart).toHaveBeenCalledTimes(2);
        expect(getEodChart.mock.calls[1][0]).toEqual(getEodChart.mock.calls[0][0]);
        expect(host.querySelector('.btn-retry')).toBeNull();
        expect(component.chart!.points).toHaveLength(20);
    });

    it('a malformed response is an error, not an empty chart', async () => {
        await create(() => of({ success: true, data: { oops: true } } as unknown as EodChartResponse));
        expect(chartText()).toContain('Unable to load the chart.');
    });

    it('an empty range shows the empty message, not an error', async () => {
        await create(() => ok([]));
        expect(chartText()).toContain('No EOD data is available for the selected filters.');
        expect(host.querySelector('.btn-retry')).toBeNull();
        expect(component.rows).toHaveLength(3);
    });

    it('requests nothing, and keeps the chart, while a custom range is incomplete or invalid', async () => {
        await create();
        await click('Custom');
        const requests = getEodChart.mock.calls.length;
        const before = component.chartPoints;
        const from = host.querySelector<HTMLInputElement>('#eod-from')!;
        from.value = '2024-01-01';                                               // over a year before To: To is cleared
        from.dispatchEvent(new Event('change', { bubbles: true }));
        await settle();
        expect(component.customTill).toBe('');
        expect(getEodChart.mock.calls.length).toBe(requests);
        expect(component.chartPoints).toBe(before);
        const till = host.querySelector<HTMLInputElement>('#eod-till')!;
        till.value = '2024-06-30';                                               // valid again: one request for exactly this range
        till.dispatchEvent(new Event('change', { bubbles: true }));
        await settle();
        expect(getEodChart.mock.calls.length).toBe(requests + 1);
        expect(getEodChart.mock.calls.at(-1)![0]).toMatchObject({ date_from: '2024-01-01', date_till: '2024-06-30' });
    });

    it('the tooltip reads the chart series, not the table rows', async () => {
        await create();
        component.chartTooltip = { index: 120, left: 10, top: 10 };
        expect(component.chartTooltipRow).toEqual(component.chartPoints[120]);
        expect(component.chartTooltipRow!.date).toBe(series(300)[120].date);
        expect(component.chartTooltipRows()[0].value).toBe('20,120.00');
    });
});

describe('readChartPoints', () => {
    it('returns the points oldest first and keeps every valid one', () => {
        expect(readChartPoints([{ date: '2026-10-16', close: 3 }, { date: '2026-10-14', close: 1 }, { date: '2026-10-15', close: 1 }]))
            .toEqual([{ date: '2026-10-14', close: 1 }, { date: '2026-10-15', close: 1 }, { date: '2026-10-16', close: 3 }]);
    });
    it('skips malformed entries instead of drawing them as zero, and rejects a non-list payload', () => {
        expect(readChartPoints([{ date: '2026-10-14', close: 1 }, { date: '', close: 2 }, { close: 3 }, { date: '2026-10-15', close: null }, { date: '2026-10-16', close: '5' }, null]))
            .toEqual([{ date: '2026-10-14', close: 1 }]);
        expect(readChartPoints([])).toEqual([]);
        for (const bad of [undefined, null, {}, 'x', 5]) expect(readChartPoints(bad)).toBeNull();
    });
});
