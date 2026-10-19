import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EodComponent } from './eod.component';
import { EodService } from './eod.service';

const older = { date: '2026-10-14', symbol: 'NIFTY', open: 100, high: 130, low: 90, close: 1234.5, volume: 123456, oi: 5000 };
const newer = { date: '2026-10-16', symbol: 'NIFTY', open: 1000, high: 1200, low: 900, close: 1100, volume: 2500, oi: 150000 };

describe('EodComponent table rows', () => {
    let fixture: ReturnType<typeof TestBed.createComponent<EodComponent>>;
    let component: EodComponent;
    let host: HTMLElement;

    async function create() {
        await TestBed.configureTestingModule({
            imports: [EodComponent],
            providers: [{
                provide: EodService,
                useValue: {
                    getSymbols: () => of(['NIFTY']),
                    getDdGreeks: () => of({ success: true, data: { symbol: 'NIFTY', trade_date: '2026-10-16', expiry_date: ['2026-10-29'], underlying: 22630, strike: [22600], atm_strike: 22600, market_price: { CE: 1, PE: 1 } } }),
                    // the API returns newest first; the screen sorts ascending and shows newest first
                    getEod: () => of({ success: true, data: { results: [newer, older], page: 1, has_next: false, has_previous: false } }),
                    getEodChart: () => of({ success: true, data: [] }),
                },
            }],
        }).compileComponents();
        fixture = TestBed.createComponent(EodComponent);
        component = fixture.componentInstance;
        host = fixture.nativeElement as HTMLElement;
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();
    }

    afterEach(() => { vi.restoreAllMocks(); TestBed.resetTestingModule(); });

    const cells = () => Array.from(host.querySelectorAll('tbody tr')).map(row => Array.from(row.querySelectorAll('td')).map(td => td.textContent?.trim()));

    it('shows the newest session first with Indian-format prices and thousands-formatted volume and OI', async () => {
        await create();
        expect(cells()).toEqual([
            ['2026-10-16', '1,000.00', '1,200.00', '900.00', '1,100.00', '2.5K', '150.0K'],
            ['2026-10-14', '100.00', '130.00', '90.00', '1,234.50', '123.5K', '5.0K'],
        ]);
    });

    it('hands the table a stable array between change-detection passes, and a new one only when the rows change', async () => {
        await create();
        const first = component.displayRows;
        expect(component.displayRows).toBe(first);
        expect(first.map(row => row.date)).toEqual(['2026-10-16', '2026-10-14']);
        expect(component.rows.map(row => row.date)).toEqual(['2026-10-14', '2026-10-16']);   // underlying order untouched

        component.onInstrument('CE');                                                           // a filter change reloads the rows
        fixture.detectChanges();
        await fixture.whenStable();
        expect(component.displayRows).not.toBe(first);
        expect(component.displayRows.map(row => row.date)).toEqual(['2026-10-16', '2026-10-14']);
    });

    it('exports the CSV oldest first with two-decimal prices and rounded volume and OI', async () => {
        await create();
        const blobs: Blob[] = [];
        vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => { blobs.push(blob as Blob); return 'blob:x'; });
        vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
        component.downloadCsv();
        expect(await blobs[0].text()).toBe(
            'Date,Open,High,Low,Close,Volume,OI\n2026-10-14,100.00,130.00,90.00,1234.50,123456,5000\n2026-10-16,1000.00,1200.00,900.00,1100.00,2500,150000');
    });
});
