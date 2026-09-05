import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { EMPTY, Subject, catchError, finalize, of, switchMap, takeUntil, tap } from 'rxjs';
import { ToastService } from '../../../core/services/toast.service';
import { DataTableComponent } from '../../../shared/components/data-table/data-table.component';
import { DataTableColumn } from '../../../shared/components/data-table/data-table.types';
import { GreeksSymbolDetails } from '../greeks/greeks.model';
import { ImpliedVolatilityService } from './implied-volatility.service';
import { ImpliedVolatilityChart, ImpliedVolatilityMode, ImpliedVolatilityOptionType, ImpliedVolatilityPriceSource, ImpliedVolatilityResult, ImpliedVolatilityTraceRow } from './implied-volatility.model';

@Component({
    selector: 'app-implied-volatility',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, DataTableComponent],
    templateUrl: './implied-volatility.component.html',
    styleUrl: './implied-volatility.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImpliedVolatilityComponent implements OnInit, OnDestroy {
    private readonly volatility = inject(ImpliedVolatilityService);
    private readonly toast = inject(ToastService);
    private readonly changeDetector = inject(ChangeDetectorRef);
    private readonly symbolSelection$ = new Subject<string>();
    private readonly destroy$ = new Subject<void>();

    readonly form = new FormGroup({
        mode: new FormControl<ImpliedVolatilityMode>('eod', { nonNullable: true }),
        symbol: new FormControl('', { nonNullable: true, validators: Validators.required }),
        underlying: new FormControl(0, { nonNullable: true, validators: Validators.required }),
        strike: new FormControl(0, { nonNullable: true, validators: Validators.required }),
        expiry: new FormControl(0, { nonNullable: true, validators: Validators.required }),
        marketPrice: new FormControl(0, { nonNullable: true, validators: Validators.required }),
        rate: new FormControl(10, { nonNullable: true, validators: Validators.required }),
    });

    symbols: string[] = [];
    filteredSymbols: string[] = [];
    symbolDetails: GreeksSymbolDetails | null = null;
    strikes: number[] = [];
    expiryDate = '';
    tradeDate = '';
    sourceNote = '';
    highlightedSymbolIndex = -1;
    suggestionsOpen = false;
    symbolsLoading = true;
    detailsLoading = false;
    optionType: ImpliedVolatilityOptionType = 'call';
    priceSource: ImpliedVolatilityPriceSource = 'auto';
    liveUpgradeRequested = false;
    result: ImpliedVolatilityResult | null = null;
    chart: ImpliedVolatilityChart | null = null;
    traceRows: ImpliedVolatilityTraceRow[] = [];
    readonly traceColumns: DataTableColumn<ImpliedVolatilityTraceRow>[] = [
        { key: 'step', label: 'Step', type: 'number', align: 'left' },
        { key: 'volatility', label: 'Volatility', formatter: value => `${Number(value).toFixed(4)}%`, align: 'right' },
        { key: 'modelPrice', label: 'Model price', formatter: value => Number(value).toFixed(4), align: 'right' },
        { key: 'residual', label: 'Residual', formatter: value => Math.abs(Number(value)) < 1e-9 ? Number(value).toExponential(1) : Number(value).toFixed(6), align: 'right' },
        { key: 'vega', label: 'Vega', formatter: value => Number(value).toFixed(4), align: 'right' },
    ];
    error = '';

    ngOnInit(): void {
        this.loadSymbols();
        this.setupDetailsLoading();
        this.setupCalculationInputs();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
        this.symbolSelection$.complete();
    }

    get modeControl(): FormControl<ImpliedVolatilityMode> { return this.form.controls.mode; }
    get symbolControl(): FormControl<string> { return this.form.controls.symbol; }
    get underlyingControl(): FormControl<number> { return this.form.controls.underlying; }
    get strikeControl(): FormControl<number> { return this.form.controls.strike; }
    get expiryControl(): FormControl<number> { return this.form.controls.expiry; }
    get marketPriceControl(): FormControl<number> { return this.form.controls.marketPrice; }
    get rateControl(): FormControl<number> { return this.form.controls.rate; }

    selectMode(mode: ImpliedVolatilityMode): void {
        this.modeControl.setValue(mode, { emitEvent: false });
        this.error = '';
        this.result = null;
        this.chart = null;
        this.traceRows = [];
        if (mode === 'custom') {
            this.priceSource = 'manual';
            this.sourceNote = 'Manual entry';
            this.strikes = [];
            this.expiryDate = '';
            this.symbolDetails = null;
            this.calculate();
        } else if (mode === 'eod') {
            this.priceSource = 'auto';
            const selected = this.symbolControl.value || this.symbols[0];
            if (selected) this.selectSymbol(selected);
        }
    }

    onSymbolInput(): void {
        const query = this.symbolControl.value.trim().toLowerCase();
        this.filteredSymbols = query ? this.symbols.filter(symbol => symbol.toLowerCase().includes(query)) : this.symbols;
        this.suggestionsOpen = true;
        this.highlightedSymbolIndex = -1;
        if (!this.symbols.includes(this.symbolControl.value)) this.symbolControl.setErrors({ invalidSymbol: true });
    }

    selectSymbol(symbol: string): void {
        if (!this.symbols.includes(symbol)) return;
        this.symbolControl.setValue(symbol, { emitEvent: false });
        this.symbolControl.setErrors(null);
        this.filteredSymbols = [];
        this.suggestionsOpen = false;
        this.highlightedSymbolIndex = -1;
        this.symbolSelection$.next(symbol);
    }

    onSymbolKeydown(event: KeyboardEvent): void {
        if (!this.suggestionsOpen || !this.filteredSymbols.length) {
            if (event.key === 'ArrowDown') this.onSymbolInput();
            return;
        }
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            this.highlightedSymbolIndex = (this.highlightedSymbolIndex + 1) % this.filteredSymbols.length;
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            this.highlightedSymbolIndex = this.highlightedSymbolIndex <= 0 ? this.filteredSymbols.length - 1 : this.highlightedSymbolIndex - 1;
        } else if (event.key === 'Enter') {
            event.preventDefault();
            this.selectSymbol(this.filteredSymbols[this.highlightedSymbolIndex >= 0 ? this.highlightedSymbolIndex : 0]);
        } else if (event.key === 'Escape') {
            this.suggestionsOpen = false;
        }
    }

    onSymbolBlur(): void {
        window.setTimeout(() => {
            this.suggestionsOpen = false;
            this.changeDetector.markForCheck();
        }, 150);
    }

    selectOptionType(optionType: ImpliedVolatilityOptionType): void {
        this.optionType = optionType;
        if (this.priceSource === 'auto') this.patchAutomaticMarketPrice();
        else this.calculate();
    }

    selectPriceSource(source: ImpliedVolatilityPriceSource): void {
        this.priceSource = source;
        if (source === 'auto') this.patchAutomaticMarketPrice();
        else this.calculate();
    }

    onStrikeChange(): void { this.calculate(); }
    onFieldChange(): void { this.calculate(); }
    requestUpgrade(): void { this.liveUpgradeRequested = true; }

    statusLabel(): string {
        if (!this.result) return '';
        switch (this.result.status) {
            case 'ok': return 'Converged';
            case 'low_vega': return 'Converged — low sensitivity';
            case 'poor_fit': return 'Poor fit';
            case 'invalid_input': return 'Invalid input';
            case 'below_intrinsic': return 'Below no-arbitrage floor';
            case 'above_maximum': return 'Above theoretical maximum';
            default: return 'Failed';
        }
    }

    statusClass(): string {
        if (!this.result) return 'status';
        return this.result.ok ? (this.result.status === 'ok' ? 'status ok' : 'status warn') : 'status err';
    }

    formatPrice(value: number | null | undefined): string { return value == null ? '—' : `₹${value.toFixed(2)}`; }
    formatSensitivity(value: number | null | undefined): string {
        if (value == null) return '—';
        if (!Number.isFinite(value)) return '>100 pts';
        return `${value > 100 ? '>100' : value.toFixed(3)} pts`;
    }
    residualHint(): string { return this.result?.residual === undefined ? '' : `Residual ${this.result.residual.toExponential(2)}`; }
    vegaHint(): string { return this.result?.vega === undefined ? '' : `IV move per ₹0.05 tick · vega ${(this.result.vega / 100).toFixed(3)}`; }

    private loadSymbols(): void {
        this.volatility.getSymbols().pipe(
            takeUntil(this.destroy$),
            catchError(() => {
                this.toast.error('Unable to load symbols. Please refresh and try again.');
                return of([] as string[]);
            }),
            finalize(() => {
                this.symbolsLoading = false;
                this.changeDetector.markForCheck();
            })
        ).subscribe(symbols => {
            this.symbols = symbols;
            this.filteredSymbols = symbols;
            if (this.modeControl.value === 'eod' && symbols.length) this.selectSymbol(symbols[0]);
        });
    }

    private setupDetailsLoading(): void {
        this.symbolSelection$.pipe(
            takeUntil(this.destroy$),
            tap(() => {
                this.detailsLoading = true;
                this.error = '';
                this.result = null;
                this.chart = null;
                this.symbolDetails = null;
            }),
            switchMap(symbol => this.volatility.getSymbolDetails({ symbol }).pipe(
                tap(details => {
                    this.detailsLoading = false;
                    this.applyDetails(details);
                }),
                catchError(() => {
                    this.detailsLoading = false;
                    this.error = 'Unable to load symbol details. Please try again.';
                    this.toast.error(this.error);
                    return EMPTY;
                })
            ))
        ).subscribe(() => this.changeDetector.markForCheck());
    }

    private setupCalculationInputs(): void {
        [this.underlyingControl, this.strikeControl, this.expiryControl, this.marketPriceControl, this.rateControl].forEach(control => {
            control.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => {
                if (!this.detailsLoading) this.calculate();
            });
        });
    }

    private applyDetails(details: GreeksSymbolDetails): void {
        this.symbolDetails = details;
        this.strikes = details.strike ?? [];
        this.expiryDate = details.expiry_date;
        this.tradeDate = details.trade_date;
        this.sourceNote = `BhavCopy EOD close · ${details.trade_date}`;
        const atmStrike = this.strikes.includes(details.atm_strike) ? details.atm_strike : this.strikes[0] ?? 0;
        this.form.patchValue({ underlying: details.underlying, strike: atmStrike, expiry: this.daysBetween(details.trade_date, details.expiry_date) }, { emitEvent: false });
        this.patchAutomaticMarketPrice();
    }

    private patchAutomaticMarketPrice(): void {
        if (this.priceSource !== 'auto') return;
        const price = this.optionType === 'put' ? this.symbolDetails?.market_price?.PE : this.symbolDetails?.market_price?.CE;
        this.marketPriceControl.setValue(price ?? 0, { emitEvent: false });
        this.calculate();
    }

    private calculate(): void {
        if (this.modeControl.value === 'live' || this.detailsLoading) return;
        const result = this.volatility.solve(this.optionType, Number(this.marketPriceControl.value), Number(this.underlyingControl.value), Number(this.strikeControl.value), Number(this.expiryControl.value), Number(this.rateControl.value));
        this.result = result;
        this.traceRows = result.trace.map(step => ({
            step: step.iteration,
            volatility: step.sigma * 100,
            modelPrice: step.price,
            residual: step.residual,
            vega: step.vega / 100,
        }));
        this.chart = result.ok ? this.buildChart(result) : null;
        this.changeDetector.markForCheck();
    }

    private buildChart(result: ImpliedVolatilityResult): ImpliedVolatilityChart | null {
        if (result.ivPct === undefined || result.theoretical === undefined) return null;
        const width = 900, height = 300, paddingLeft = 58, paddingRight = 24, paddingTop = 18, paddingBottom = 32;
        const plotWidth = width - paddingLeft - paddingRight, plotHeight = height - paddingTop - paddingBottom;
        const maxVol = Math.max(result.ivPct * 2.2, 40);
        const underlying = Number(this.underlyingControl.value), strike = Number(this.strikeControl.value), days = Number(this.expiryControl.value), rate = Number(this.rateControl.value) / 100;
        const points = Array.from({ length: 141 }, (_, index) => {
            const volatility = maxVol * index / 140;
            return { volatility, price: this.volatility.bsPrice(this.optionType, underlying, strike, rate, days / 365, Math.max(volatility / 100, 1e-9)) };
        });
        const marketPrice = Number(this.marketPriceControl.value);
        let yMax = Math.max(...points.map(point => point.price), marketPrice), yMin = Math.min(...points.map(point => point.price), marketPrice);
        const padding = (yMax - yMin) * 0.1 || 1;
        yMax += padding; yMin -= padding;
        const xAt = (value: number) => paddingLeft + value / maxVol * plotWidth;
        const yAt = (value: number) => paddingTop + plotHeight - (value - yMin) / (yMax - yMin) * plotHeight;
        const gridLines = [0, 1, 2, 3, 4].map(step => { const value = yMin + (yMax - yMin) * step / 4; return { y: yAt(value), label: value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value.toFixed(0) }; });
        const xLabels = [0, 1, 2, 3, 4, 5].map(index => { const value = maxVol * index / 5; return { x: xAt(value), label: `${value.toFixed(0)}%` }; });
        const curvePath = points.map((point, index) => `${index ? 'L' : 'M'}${xAt(point.volatility).toFixed(1)},${yAt(point.price).toFixed(1)}`).join(' ');
        const solvedPoint = { x: xAt(Math.min(result.ivPct, maxVol)), y: yAt(marketPrice) };
        return { viewBox: `0 0 ${width} ${height}`, curvePath, marketLineY: yAt(marketPrice), solvedLineX: solvedPoint.x, solvedPoint, gridLines, xLabels, solvedLabel: `${result.ivPct.toFixed(2)}%` };
    }

    private daysBetween(from: string, to: string): number {
        const parse = (value: string) => { const [year, month, day] = value.split('-').map(Number); return Date.UTC(year, month - 1, day); };
        return Math.max(1, Math.round((parse(to) - parse(from)) / 86400000));
    }
}
