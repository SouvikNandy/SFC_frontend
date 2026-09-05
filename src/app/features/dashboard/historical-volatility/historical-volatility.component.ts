import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subject, catchError, finalize, of, takeUntil } from 'rxjs';
import { DataTableComponent } from '../../../shared/components/data-table/data-table.component';
import { DataTableColumn } from '../../../shared/components/data-table/data-table.types';
import { ToastService } from '../../../core/services/toast.service';
import { HistoricalVolatilityService } from './historical-volatility.service';
import { formatHistoricalVolatilityDate } from './historical-volatility-date.util';
import { HistoricalVolatilityApiRow, HistoricalVolatilityChart, HistoricalVolatilityMode, HistoricalVolatilityRow } from './historical-volatility.model';

@Component({
    selector: 'app-historical-volatility',
    imports: [ReactiveFormsModule, DataTableComponent],
    templateUrl: './historical-volatility.component.html',
    styleUrl: './historical-volatility.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistoricalVolatilityComponent implements OnInit, OnDestroy {
    private readonly volatility = inject(HistoricalVolatilityService);
    private readonly toast = inject(ToastService);
    private readonly changeDetector = inject(ChangeDetectorRef);
    private readonly destroy$ = new Subject<void>();

    readonly form = new FormGroup({
        symbol: new FormControl('', { nonNullable: true, validators: Validators.required }),
        date: new FormControl('', { nonNullable: true, validators: Validators.required }),
    });
    readonly columns: DataTableColumn<HistoricalVolatilityRow>[] = [
        { key: 'date', label: 'Date' },
        { key: 'close', label: 'Close', formatter: value => this.formatClose(value) },
        { key: 'dailyReturn', label: 'Daily return', type: 'change', formatter: value => this.formatReturn(value) },
        { key: 'hv10', label: 'HV-10', formatter: value => this.formatVolatility(value) },
        { key: 'hv20', label: 'HV-20', formatter: value => this.formatVolatility(value), rowClass: row => row.isAsOf ? 'historical-volatility__as-of' : '' },
    ];

    mode: HistoricalVolatilityMode = 'eod';
    symbols: string[] = [];
    filteredSymbols: string[] = [];
    series: HistoricalVolatilityApiRow[] = [];
    selectedIndex = -1;
    rows: HistoricalVolatilityRow[] = [];
    chart: HistoricalVolatilityChart = this.buildChart();
    liveUpgradeRequested = false;
    error = '';
    symbolsLoading = true;
    calculating = false;
    suggestionsOpen = false;

    ngOnInit(): void { this.loadSymbols(); }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    get symbolControl(): FormControl<string> { return this.form.controls.symbol; }
    get dateControl(): FormControl<string> { return this.form.controls.date; }
    get selectedDate(): string { return this.series[this.selectedIndex]?.trade_date ?? this.dateControl.value; }
    get hv10Value(): number | null { return this.series[this.selectedIndex]?.hv10 ?? null; }
    get hv20Value(): number | null { return this.series[this.selectedIndex]?.hv20 ?? null; }
    get instrumentLabel(): string { return this.symbolControl.value || 'Select a symbol'; }

    selectMode(mode: HistoricalVolatilityMode): void { this.mode = mode; }

    onSymbolInput(): void {
        const query = this.symbolControl.value.trim().toLowerCase();
        this.filteredSymbols = query ? this.symbols.filter(symbol => symbol.toLowerCase().includes(query)) : this.symbols;
        this.suggestionsOpen = true;
        if (!this.symbols.includes(this.symbolControl.value)) this.symbolControl.markAsDirty();
    }

    selectSymbol(symbol: string): void {
        this.symbolControl.setValue(symbol);
        this.symbolControl.setErrors(null);
        this.symbolControl.markAsTouched();
        this.filteredSymbols = [];
        this.suggestionsOpen = false;
        this.tryAutoCalculate();
    }

    onDateChange(): void {
        this.tryAutoCalculate();
    }

    onSymbolBlur(): void {
        window.setTimeout(() => {
            this.suggestionsOpen = false;
            this.changeDetector.markForCheck();
        }, 150);
    }

    calculate(): void {
        this.error = '';
        this.form.markAllAsTouched();
        const symbol = this.symbolControl.value.trim();
        const date = formatHistoricalVolatilityDate(this.dateControl.value);
        if (!this.symbols.some(option => option === symbol)) this.symbolControl.setErrors({ required: true });
        if (!date) this.dateControl.setErrors({ required: true });
        if (this.form.invalid || this.calculating) return;

        this.calculating = true;
        this.volatility.calculate({ symbol, date }).pipe(
            takeUntil(this.destroy$),
            catchError(() => {
                this.error = 'Unable to calculate historical volatility. Please try again.';
                this.toast.error(this.error);
                return of([] as HistoricalVolatilityApiRow[]);
            }),
            finalize(() => {
                this.calculating = false;
                this.changeDetector.markForCheck();
            })
        ).subscribe(series => {
            if (!series.length) {
                this.error = 'No historical volatility data is available for the selected symbol and date.';
                this.toast.error(this.error);
                return;
            }
            this.series = series;
            this.selectedIndex = series.length - 1;
            this.dateControl.setValue(series[this.selectedIndex].trade_date);
            this.recalculate();
        });
    }

    requestUpgrade(): void { this.liveUpgradeRequested = true; }

    formatMetric(value: number | null): string { return value === null ? '—' : `${value.toFixed(2)}%`; }

    metricMeta(value: number | null, window: number): string {
        return value === null ? `Need ${window + 1} closes ending on this date` : `${window}-day realised volatility, annualised, as of ${this.selectedDate}`;
    }

    private tryAutoCalculate(): void {
        const symbol = this.symbolControl.value.trim();
        const date = formatHistoricalVolatilityDate(this.dateControl.value);
        if (this.symbols.some(option => option === symbol) && date && !this.calculating) this.calculate();
    }

    private loadSymbols(): void {
        this.volatility.getSymbols().pipe(
            takeUntil(this.destroy$),
            catchError(() => {
                this.error = 'Unable to load symbols. Please refresh and try again.';
                this.toast.error(this.error);
                return of([] as string[]);
            }),
            finalize(() => {
                this.symbolsLoading = false;
                this.changeDetector.markForCheck();
            })
        ).subscribe(symbols => {
            this.symbols = symbols;
            this.filteredSymbols = symbols;
        });
    }

    private recalculate(): void {
        this.rows = this.series.map((point, index) => ({
            date: point.trade_date,
            close: point.close_price,
            dailyReturn: point.daily_return === null ? null : point.daily_return / 100,
            hv10: point.hv10,
            hv20: point.hv20,
            isAsOf: index === this.selectedIndex,
        })).reverse();
        this.chart = this.buildChart();
    }

    private buildChart(): HistoricalVolatilityChart {
        const width = 900, height = 260, paddingLeft = 46, paddingRight = 46, paddingTop = 10, paddingBottom = 24;
        const plotWidth = width - paddingLeft - paddingRight, plotHeight = height - paddingTop - paddingBottom;
        const closes = this.series.map(point => point.close_price);
        const hv10 = this.series.map(point => point.hv10);
        const hv20 = this.series.map(point => point.hv20);
        const priceMin = closes.length ? Math.min(...closes) : 0, priceMax = closes.length ? Math.max(...closes) : 1;
        const priceRange = priceMax - priceMin || 1;
        const volatilityValues = [...hv10, ...hv20].filter((value): value is number => value !== null);
        const volatilityMin = volatilityValues.length ? Math.min(...volatilityValues) : 0, volatilityMax = volatilityValues.length ? Math.max(...volatilityValues) : 1;
        const volatilityRange = volatilityMax - volatilityMin || 1;
        const xAt = (index: number) => this.series.length <= 1 ? paddingLeft : paddingLeft + index * plotWidth / (this.series.length - 1);
        const yPriceAt = (value: number) => paddingTop + plotHeight - (value - priceMin) / priceRange * plotHeight;
        const yVolatilityAt = (value: number) => paddingTop + plotHeight - (value - volatilityMin) / volatilityRange * plotHeight;
        const gridLines = [0, 1, 2].map(step => {
            const fraction = step / 2;
            return { y: paddingTop + plotHeight * fraction, priceLabel: (priceMax - fraction * (priceMax - priceMin)).toFixed(0), volatilityLabel: `${(volatilityMax - fraction * (volatilityMax - volatilityMin)).toFixed(1)}%` };
        });
        const xLabels = this.series.length ? (this.series.length > 1 ? [0, Math.floor((this.series.length - 1) / 2), this.series.length - 1] : [0]).map(index => ({ x: xAt(index), label: this.series[index].trade_date })) : [];
        const marker = this.selectedIndex >= 0 && this.selectedIndex < this.series.length ? { x: xAt(this.selectedIndex), y: yPriceAt(closes[this.selectedIndex]) } : null;
        return { pricePath: this.pathFor(closes, xAt, yPriceAt), hv10Path: this.pathFor(hv10, xAt, yVolatilityAt), hv20Path: this.pathFor(hv20, xAt, yVolatilityAt), gridLines, xLabels, marker, viewBox: `0 0 ${width} ${height}` };
    }

    private pathFor(values: Array<number | null>, xAt: (index: number) => number, yAt: (value: number) => number): string {
        let path = '', drawing = false;
        values.forEach((value, index) => {
            if (value === null) { drawing = false; return; }
            path += `${drawing ? 'L' : 'M'}${xAt(index).toFixed(1)},${yAt(value).toFixed(1)} `;
            drawing = true;
        });
        return path.trim();
    }

    private formatClose(value: unknown): string {
        const numericValue = Number(value);
        return Number.isFinite(numericValue) ? `₹${numericValue.toLocaleString('en-IN')}` : '—';
    }

    private formatReturn(value: unknown): string {
        const numericValue = Number(value);
        return Number.isFinite(numericValue) ? `${numericValue >= 0 ? '+' : ''}${(numericValue * 100).toFixed(2)}%` : '—';
    }

    private formatVolatility(value: unknown): string {
        const numericValue = Number(value);
        return Number.isFinite(numericValue) ? `${numericValue.toFixed(2)}%` : '—';
    }
}
