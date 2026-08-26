import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EodService } from './eod.service';
import { DdGreeksData, EodDataRow, EodRequest, EodSymbol } from './eod.model';
import { buildEodChart, ChartResult } from './eod-chart.util';
import { DataTableColumn } from '../../../shared/components/data-table/data-table.types';
import { DataTableComponent } from '../../../shared/components/data-table/data-table.component';
import { ToastService } from '../../../core/services/toast.service';
import { EMPTY, Subject } from 'rxjs';
import { catchError, switchMap, takeUntil, tap } from 'rxjs/operators';

@Component({
    selector: 'app-eod',
    standalone: true,
    imports: [CommonModule, DataTableComponent],
    templateUrl: './eod.component.html',
    styleUrls: ['./eod.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EodComponent implements OnInit, OnDestroy {
    symbols: EodSymbol[] = ['NIFTY', 'BANKNIFTY'];
    ranges = ['1W', '1M', '3M', 'Custom'] as const;

    // filter state
    symbol: EodSymbol = 'NIFTY';
    instrument: 'FUT' | 'CE' | 'PE' = 'FUT';
    strike?: number;
    expiry?: string;
    strikeOptions: number[] = [];
    expiryOptions: string[] = [];
    ddGreeksData: DdGreeksData | null = null;
    range: '1W' | '1M' | '3M' | 'Custom' = '1W';
    // custom date range values (YYYY-MM-DD)
    customFrom = '';
    customTill = '';
    dateRangeOpen = false;
    todayStr = '';


    loading = false;
    isMetadataLoading = false;
    isEodLoading = false;
    error = '';
    rows: EodDataRow[] = [];
    chart: ChartResult | null = null;
    currentPage = 1;
    currentPageSize = 10;
    readonly pageSizes = [10, 25, 50];
    hasNextPage = false;
    hasPreviousPage = false;

    readonly eodColumns: DataTableColumn<EodDataRow>[] = [
        { key: 'date', label: 'Date', type: 'text' },
        { key: 'open', label: 'Open', type: 'number', align: 'right' },
        { key: 'high', label: 'High', type: 'number', align: 'right' },
        { key: 'low', label: 'Low', type: 'number', align: 'right' },
        {
            key: 'ltp',
            label: 'LTP',
            type: 'change',
            align: 'right',
            value: row => row.ltp - row.open,
            formatter: (_value, row) => this.formatPrice(row.ltp),
        },
        { key: 'volume', label: 'Volume', type: 'text', align: 'right', formatter: value => this.formatThousands(value) },
        { key: 'oi', label: 'OI', type: 'text', align: 'right', formatter: value => this.formatThousands(value) },
    ];

    private refresh$ = new Subject<{ loadMetadata: boolean }>();
    private destroy$ = new Subject<void>();

    constructor(private readonly svc: EodService, private readonly changeDetector: ChangeDetectorRef, private readonly toast: ToastService) { }

    ngOnInit(): void {
        // initial defaults
        this.instrument = 'FUT';
        this.symbol = 'NIFTY';
        this.range = '1W';
        // set today string (local date) for max attribute
        const t = new Date();
        this.todayStr = new Date(t.getFullYear(), t.getMonth(), t.getDate()).toISOString().slice(0, 10);
        // default custom range to last week
        const till = this.todayStr;
        const from = new Date();
        from.setDate(from.getDate() - 7);
        this.customFrom = from.toISOString().slice(0, 10);
        this.customTill = till;
        this.setupReload();
        this.refresh$.next({ loadMetadata: true });
    }

    private setupReload() {
        this.refresh$
            .pipe(
                takeUntil(this.destroy$),
                tap(({ loadMetadata }) => {
                    this.loading = true;
                    this.isMetadataLoading = loadMetadata;
                    this.isEodLoading = !loadMetadata;
                    this.error = '';
                    this.rows = [];
                    this.chart = null;
                    if (loadMetadata) {
                        this.ddGreeksData = null;
                        this.strikeOptions = [];
                        this.expiryOptions = [];
                        this.strike = undefined;
                        this.expiry = undefined;
                    }
                }),
                switchMap(({ loadMetadata }) => {
                    const metadata$ = loadMetadata
                        ? this.svc.getDdGreeks({ symbol: this.symbol }).pipe(
                            tap((res) => {
                                this.ddGreeksData = res.data;
                                this.strikeOptions = res.data.strike;
                                this.expiryOptions = res.data.expiry_date ? [res.data.expiry_date] : [];
                                this.strike = this.selectDefaultStrike(res.data.strike, res.data.atm_strike);
                                this.expiry = this.expiryOptions[0];
                                this.isMetadataLoading = false;
                                this.isEodLoading = true;
                            })
                        )
                        : EMPTY;

                    return (loadMetadata ? metadata$.pipe(switchMap(() => this.loadEod())) : this.loadEod()).pipe(
                        catchError(() => {
                            this.isMetadataLoading = false;
                            this.isEodLoading = false;
                            this.loading = false;
                            this.error = loadMetadata ? 'Failed to load EOD metadata' : 'Failed to load EOD data';
                            this.toast.error(this.error);
                            return EMPTY;
                        })
                    );
                })
            )
            .subscribe((res) => {
                this.isEodLoading = false;
                this.loading = false;
                const paginatedData = res.data;
                this.currentPage = paginatedData.page;
                this.hasNextPage = paginatedData.has_next;
                this.hasPreviousPage = paginatedData.has_previous;
                this.rows = paginatedData.results.slice().sort((a, b) => a.date.localeCompare(b.date));
                this.chart = buildEodChart(this.rows.slice(-200));
                this.changeDetector.markForCheck();
            });
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
        this.refresh$.complete();
    }

    private loadEod() {
        const { date_from, date_till } = this.calcDateRange(this.range);
        const req: EodRequest = {
            symbol: this.symbol,
            option_type: this.instrument === 'FUT' ? 'XX' : (this.instrument as 'CE' | 'PE'),
            date_from,
            date_till,
            page: this.currentPage,
            page_size: this.currentPageSize,
        };
        if (this.instrument !== 'FUT') {
            if (this.strike != null) req.strike = Math.round(this.strike);
            if (this.expiry) req.expiry = this.expiry;
        }
        return this.svc.getEod(req);
    }

    private selectDefaultStrike(strikes: number[], atmStrike: number): number | undefined {
        return strikes.includes(atmStrike) ? atmStrike : strikes[0];
    }

    get displayRows(): EodDataRow[] {
        return this.rows.slice().reverse();
    }

    get displayColumns(): DataTableColumn<EodDataRow>[] {
        return this.eodColumns.map(column => column.key === 'ltp'
            ? { ...column, label: this.instrument === 'FUT' ? 'Close' : 'LTP' }
            : column);
    }

    private formatPrice(value: number): string {
        return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
    }

    private formatThousands(value: unknown): string {
        const numericValue = typeof value === 'number' ? value : Number(value);
        return `${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(numericValue / 1000)}K`;
    }

    private calcDateRange(range: string) {
        const today = new Date();
        const till = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
        const fmt = (d: Date) => d.toISOString().slice(0, 10);
        if (range === 'Custom') {
            // customFrom/till are already YYYY-MM-DD from input
            return { date_from: this.customFrom || fmt(new Date(till.getTime() - 7 * 86400000)), date_till: this.customTill || fmt(till) };
        }
        let from = new Date(till);
        if (range === '1W') from.setDate(till.getDate() - 7);
        else if (range === '1M') from.setMonth(till.getMonth() - 1);
        else if (range === '3M') from.setMonth(till.getMonth() - 3);
        return { date_from: fmt(from), date_till: fmt(till) };
    }

    onSymbol(sym: EodSymbol) { this.symbol = sym; this.currentPage = 1; this.refresh$.next({ loadMetadata: true }); }
    onInstrument(inst: 'FUT' | 'CE' | 'PE') { this.instrument = inst; this.resetPageAndRefresh(); }
    onStrikeChange(event: Event) {
        const value = Number((event.target as HTMLSelectElement).value);
        if (Number.isFinite(value)) this.onStrike(value);
    }

    onExpiryChange(event: Event) {
        this.onExpiry((event.target as HTMLSelectElement).value);
    }

    onStrike(s: number) { this.strike = s; this.resetPageAndRefresh(); }
    onExpiry(e: string) { this.expiry = e; this.resetPageAndRefresh(); }
    onRange(r: '1W' | '1M' | '3M' | 'Custom') {
        this.range = r;
        if (r === 'Custom') {
            // ensure defaults exist and validate
            if (!this.customFrom) {
                const d = new Date(); d.setDate(d.getDate() - 7); this.customFrom = d.toISOString().slice(0, 10);
            }
            if (!this.customTill) {
                const d = new Date(); this.customTill = d.toISOString().slice(0, 10);
            }
            if (!this.validateCustomDates()) return;
            // The custom range is applied by the Done action.
        } else {
            this.resetPageAndRefresh();
        }
    }



    onCustomFromChange(value: Event | string) {
        this.onCustomFrom(typeof value === 'string' ? value : (value.target as HTMLInputElement).value);
    }

    onCustomTillChange(value: Event | string) {
        this.onCustomTill(typeof value === 'string' ? value : (value.target as HTMLInputElement).value);
    }

    get customRangeLabel(): string {
        if (!this.customFrom || !this.customTill) return 'Select date range';
        return `${this.formatDateLabel(this.customFrom)} - ${this.formatDateLabel(this.customTill)}`;
    }

    toggleDateRange(): void {
        this.dateRangeOpen = !this.dateRangeOpen;
    }

    closeDateRange(): void {
        this.dateRangeOpen = false;
    }

    applyCustomDateRange(): void {
        this.onCustomFromChange(this.customFrom);
        this.onCustomTillChange(this.customTill);
        if (this.validateCustomDates()) this.resetPageAndRefresh();
        this.closeDateRange();
    }

    private formatDateLabel(value: string): string {
        const date = new Date(`${value}T00:00:00`);
        return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
    }

    onCustomFrom(val: string) {
        this.customFrom = val;
    }

    onCustomTill(val: string) {
        this.customTill = val;
    }

    private refreshEod(): void {
        if (!this.isMetadataLoading) this.refresh$.next({ loadMetadata: false });
    }

    private resetPageAndRefresh(): void {
        this.currentPage = 1;
        this.refreshEod();
    }

    goToNextPage(): void {
        if (!this.hasNextPage || this.loading) return;
        this.currentPage += 1;
        this.refreshEod();
    }

    goToPreviousPage(): void {
        if (!this.hasPreviousPage || this.loading) return;
        this.currentPage = Math.max(1, this.currentPage - 1);
        this.refreshEod();
    }

    onPageSizeChange(event: Event): void {
        const pageSize = Number((event.target as HTMLSelectElement).value);
        if (this.pageSizes.includes(pageSize) && pageSize !== this.currentPageSize) {
            this.currentPageSize = pageSize;
            this.currentPage = 1;
            this.refreshEod();
        }
    }

    validateCustomDates(): boolean {
        this.error = '';
        if (!this.customFrom || !this.customTill) { this.error = 'Select both start and end dates'; return false; }
        // no future dates
        const today = new Date(this.todayStr + 'T00:00:00');
        const from = new Date(this.customFrom + 'T00:00:00');
        const till = new Date(this.customTill + 'T00:00:00');
        if (from > today || till > today) { this.error = 'Dates cannot be in the future'; return false; }
        if (from > till) { this.error = 'Start date cannot be after end date'; return false; }
        return true;
    }

    downloadCsv() {
        if (!this.rows || this.rows.length === 0) {
            this.toast.error('There is no EOD data available to download.');
            return;
        }
        try {
            const isOption = this.instrument === 'CE' || this.instrument === 'PE';
            const closeLabel = isOption ? 'LTP' : 'Close';
            const header = `Date,Open,High,Low,${closeLabel},Volume,OI\n`;
            const body = this.rows.map(r => [r.date, r.open.toFixed(2), r.high.toFixed(2), r.low.toFixed(2), r.ltp.toFixed(2), Math.round(r.volume), Math.round(r.oi)].join(',')).join('\n');
            const label = isOption ? `${this.symbol}_${Math.round(this.strike || 0)}${this.instrument}_${this.range}` : `${this.symbol}_FUT_${this.range}`;
            const filename = `${label}_EOD.csv`;
            const blob = new Blob([header + body], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = filename;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            URL.revokeObjectURL(url);
            this.toast.success(`${this.symbol} EOD data exported.`);
        } catch {
            this.toast.error('Unable to download the EOD CSV. Please try again.');
        }
    }
}
