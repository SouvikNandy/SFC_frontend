import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  EMPTY,
  Subject,
  catchError,
  debounceTime,
  finalize,
  of,
  switchMap,
  takeUntil,
  tap,
} from 'rxjs';
import { DataTableComponent } from '../../../shared/components/data-table/data-table.component';
import { DataTableColumn } from '../../../shared/components/data-table/data-table.types';
import { ToastService } from '../../../core/services/toast.service';
import { DefaultStock } from '../../../shared/services/constantFile';
import { GreeksSymbolDetails } from '../greeks/greeks.model';
import { ProbabilityService } from './probability.service';
import {
  ProbabilityApiData,
  ProbabilityChart,
  ProbabilityDetailRow,
  ProbabilityMode,
  ProbabilityRequest,
  ProbabilitySymbolDetails,
} from './probability.model';

@Component({
  selector: 'app-probability',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DataTableComponent],
  templateUrl: './probability.component.html',
  styleUrl: './probability.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProbabilityComponent implements OnInit, OnDestroy {
  private readonly probability = inject(ProbabilityService);
  private readonly toast = inject(ToastService);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly symbolSelection$ = new Subject<string>();
  private readonly calculationRequest$ = new Subject<void>();
  private readonly destroy$ = new Subject<void>();

  readonly form = new FormGroup({
    mode: new FormControl<ProbabilityMode>('eod', { nonNullable: true }),
    symbol: new FormControl('', { nonNullable: true, validators: Validators.required }),
    spot: new FormControl(0, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0.0001)],
    }),
    target: new FormControl(0, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0.0001)],
    }),
    expiry: new FormControl(0, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(1), Validators.max(3650)],
    }),
    vol: new FormControl(0, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0.0001), Validators.max(1000)],
    }),
  });

  readonly detailColumns: DataTableColumn<ProbabilityDetailRow>[] = [
    {
      key: 'label',
      label: 'Supporting calculation',
      value: (row) => `${row.label}\n${row.description}`,
      formatter: (_value, row) => row.label,
      secondaryFormatter: (row) => row.description,
    },
    { key: 'value', label: 'Value', align: 'right' },
  ];

  symbols: string[] = [];
  filteredSymbols: string[] = [];
  symbolDetails: ProbabilitySymbolDetails | null = null;
  symbolsLoading = true;
  detailsLoading = false;
  calculating = false;
  suggestionsOpen = false;
  highlightedSymbolIndex = -1;
  liveUpgradeRequested = false;
  sourceNote = '';
  error = '';
  data: ProbabilityApiData | null = null;
  chart: ProbabilityChart | null = null;
  detailRows: ProbabilityDetailRow[] = [];

  ngOnInit(): void {
    this.loadSymbols();
    this.setupSymbolDetails();
    this.setupCalculation();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.symbolSelection$.complete();
    this.calculationRequest$.complete();
  }

  get modeControl(): FormControl<ProbabilityMode> {
    return this.form.controls.mode;
  }
  get symbolControl(): FormControl<string> {
    return this.form.controls.symbol;
  }
  get spotControl(): FormControl<number> {
    return this.form.controls.spot;
  }
  get targetControl(): FormControl<number> {
    return this.form.controls.target;
  }
  get expiryControl(): FormControl<number> {
    return this.form.controls.expiry;
  }
  get volControl(): FormControl<number> {
    return this.form.controls.vol;
  }

  selectMode(mode: ProbabilityMode): void {
    this.modeControl.setValue(mode, { emitEvent: false });
    this.error = '';
    this.data = null;
    this.chart = null;
    this.detailRows = [];
    if (mode === 'custom') {
      this.sourceNote = 'Manual entry';
      this.symbolDetails = null;
      this.calculate();
    } else if (mode === 'eod') {
      const selected = this.symbolControl.value || this.symbols[0];
      if (selected) this.selectSymbol(selected);
    }
  }

  onSymbolInput(): void {
    const query = this.symbolControl.value.trim().toLowerCase();
    this.filteredSymbols = query
      ? this.symbols.filter((symbol) => symbol.toLowerCase().includes(query))
      : this.symbols;
    this.suggestionsOpen = true;
    this.highlightedSymbolIndex = -1;
    if (!this.symbols.includes(this.symbolControl.value))
      this.symbolControl.setErrors({ invalidSymbol: true });
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

  clearSymbol(): void {
    this.symbolControl.setValue('', { emitEvent: false });
    this.symbolControl.setErrors({ required: true });
    this.filteredSymbols = this.symbols;
    this.suggestionsOpen = false;
    this.highlightedSymbolIndex = -1;
    this.detailsLoading = false;
    this.symbolDetails = null;
    this.sourceNote = '';
    this.data = null;
    this.chart = null;
    this.detailRows = [];
    this.symbolSelection$.next('');
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
      this.highlightedSymbolIndex =
        this.highlightedSymbolIndex <= 0
          ? this.filteredSymbols.length - 1
          : this.highlightedSymbolIndex - 1;
    } else if (event.key === 'Enter') {
      event.preventDefault();
      this.selectSymbol(
        this.filteredSymbols[this.highlightedSymbolIndex >= 0 ? this.highlightedSymbolIndex : 0],
      );
    } else if (event.key === 'Escape') this.suggestionsOpen = false;
  }

  onSymbolBlur(): void {
    window.setTimeout(() => {
      this.suggestionsOpen = false;
      this.changeDetector.markForCheck();
    }, 150);
  }
  onFieldChange(): void {
    if (!this.detailsLoading && this.modeControl.value !== 'live') this.calculate();
  }
  recalculate(): void {
    this.calculate();
  }
  requestUpgrade(): void {
    this.liveUpgradeRequested = true;
  }

  probabilityAtExpiry(): number | null {
    if (!this.data) return null;
    return this.data.results.direction === 'below'
      ? this.data.results.probExpireBelowPct
      : this.data.results.probExpireAbovePct;
  }

  directionLabel(): string {
    return this.data?.results.direction === 'below' ? 'below' : 'beyond';
  }
  formatPercent(value: number | null | undefined): string {
    return value == null || !Number.isFinite(value) ? '—' : `${value.toFixed(2)}%`;
  }
  formatPrice(value: number | null | undefined): string {
    return value == null || !Number.isFinite(value)
      ? '—'
      : `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  }

  private loadSymbols(): void {
    this.probability
      .getSymbols()
      .pipe(
        takeUntil(this.destroy$),
        catchError(() => {
          this.toast.error('Unable to load symbols. Please refresh and try again.');
          return of([] as string[]);
        }),
        finalize(() => {
          this.symbolsLoading = false;
          this.changeDetector.markForCheck();
        }),
      )
      .subscribe((symbols) => {
        this.symbols = symbols;
        this.filteredSymbols = symbols;
        const initialSymbol = symbols.includes(DefaultStock) ? DefaultStock : symbols[0];
        if (initialSymbol) this.selectSymbol(initialSymbol);
      });
  }

  private setupSymbolDetails(): void {
    this.symbolSelection$
      .pipe(
        takeUntil(this.destroy$),
        tap((symbol) => {
          this.detailsLoading = Boolean(symbol);
          this.error = '';
          this.data = null;
          this.chart = null;
          this.detailRows = [];
          this.symbolDetails = null;
        }),
        switchMap((symbol) =>
          symbol
            ? this.probability.getSymbolDetails({ symbol }).pipe(
                catchError(() => {
                  this.detailsLoading = false;
                  this.error = 'Unable to load symbol details. Please try again.';
                  this.toast.error(this.error);
                  return EMPTY;
                }),
              )
            : EMPTY,
        ),
      )
      .subscribe((details) => {
        this.detailsLoading = false;
        this.applyDetails(details);
        this.changeDetector.markForCheck();
      });
  }

  private setupCalculation(): void {
    this.calculationRequest$
      .pipe(
        takeUntil(this.destroy$),
        debounceTime(250),
        switchMap(() => {
          const request = this.buildRequest();
          if (!request) {
            this.calculating = false;
            this.data = null;
            this.chart = null;
            this.detailRows = [];
            return EMPTY;
          }
          this.calculating = true;
          const calculation$ =
            this.modeControl.value === 'custom'
              ? of(this.probability.calculateCustom(request))
              : this.probability.calculate(request);
          return calculation$.pipe(
            catchError(() => {
              this.error = 'Unable to calculate probability. Please try again.';
              this.toast.error(this.error);
              return EMPTY;
            }),
            finalize(() => {
              this.calculating = false;
              this.changeDetector.markForCheck();
            }),
          );
        }),
      )
      .subscribe((data) => {
        if (!data) return;
        this.error = '';
        this.data = data;
        this.detailRows = this.buildDetailRows(data);
        this.chart = this.buildChart(data);
        this.changeDetector.markForCheck();
      });
  }

  private applyDetails(details: GreeksSymbolDetails): void {
    this.symbolDetails = details;
    this.sourceNote = `Values below refresh from your selection · ${details.trade_date}`;
    const currentTarget = this.targetControl.value;
    const target = currentTarget > 0 ? currentTarget : details.underlying;
    const expiry = this.resolveExpiryDays(details);
    this.form.patchValue(
      { spot: Math.round(details.underlying), target, expiry, vol: details.hv20 ?? 0 },
      { emitEvent: false },
    );
    this.calculate();
  }

  private resolveExpiryDays(details: GreeksSymbolDetails): number {
    if (typeof details.expiry_days === 'number' && Number.isFinite(details.expiry_days)) return Math.max(1, details.expiry_days);
    if (typeof details.expiry === 'number' && Number.isFinite(details.expiry)) return Math.max(1, details.expiry);
    const expiry = Array.isArray(details.expiry_date) ? details.expiry_date[0] : details.expiry_date;
    if (typeof expiry === 'number' && Number.isFinite(expiry)) return Math.max(1, expiry);
    return typeof expiry === 'string' ? this.daysBetween(details.trade_date, expiry) : 0;
  }

  private calculate(): void {
    if (this.modeControl.value !== 'live') {
      this.data = null;
      this.chart = null;
      this.detailRows = [];
    }
    this.calculationRequest$.next();
  }

  private buildRequest(): ProbabilityRequest | null {
    if (this.modeControl.value === 'live') return null;
    const symbol =
      this.modeControl.value === 'custom'
        ? this.symbolControl.value || 'CUSTOM'
        : this.symbolControl.value;
    const spot = Number(this.spotControl.value),
      target = Number(this.targetControl.value),
      expiry = Number(this.expiryControl.value),
      iv = Number(this.volControl.value);
    if (!symbol) {
      this.error = 'Select an instrument.';
      return null;
    }
    if (!Number.isFinite(spot) || spot <= 0) {
      this.error = 'Underlying price must be greater than 0.';
      return null;
    }
    if (!Number.isFinite(target) || target <= 0) {
      this.error = 'Target price must be greater than 0.';
      return null;
    }
    if (!Number.isFinite(iv) || iv <= 0) {
      this.error = 'Volatility must be greater than 0%.';
      return null;
    }
    if (iv > 1000) {
      this.error = 'Volatility above 1000% is outside the supported range.';
      return null;
    }
    if (!Number.isFinite(expiry) || expiry <= 0) {
      this.error = 'Days to expiry must be at least 1.';
      return null;
    }
    if (expiry > 3650) {
      this.error = 'Days to expiry above 3650 (10 years) is outside the supported range.';
      return null;
    }
    if (Math.max(target / spot, spot / target) > 100) {
      this.error = 'Target is more than 100x away from spot - check your inputs.';
      return null;
    }
    this.error = '';
    return { symbol, spot: Math.round(spot), target, expiry, iv };
  }

  private buildDetailRows(data: ProbabilityApiData): ProbabilityDetailRow[] {
    const results = data.results;
    return [
      {
        label: '1 s.d. range at expiry',
        description: 'About 68% of outcomes fall in this band',
        value: `${this.formatPrice(results.oneSdLower)} — ${this.formatPrice(results.oneSdUpper)}`,
      },
      {
        label: 'Move required to target',
        description: 'Distance from spot, in % and in standard deviations',
        value: `${results.movePct >= 0 ? '+' : ''}${results.movePct.toFixed(2)}% (${results.moveSd.toFixed(4)} s.d.)`,
      },
      {
        label: 'd2',
        description: 'Standardised distance used for expiry probability',
        value: results.d2.toFixed(4),
      },
      {
        label: 'Time to expiry',
        description: 'In years, using a 365-day convention',
        value: `${results.timeYears.toFixed(4)} yr`,
      },
    ];
  }

  private buildChart(data: ProbabilityApiData): ProbabilityChart | null {
    const points = data.charts?.curve ?? [];
    if (points.length < 2) return null;
    const width = 900,
      height = 260,
      padLeft = 20,
      padRight = 20,
      padTop = 14,
      padBottom = 26;
    const prices = points.map((point) => point.price),
      densities = points.map((point) => point.density),
      target = Number(this.targetControl.value),
      spot = Number(this.spotControl.value),
      minPrice = Math.min(...prices, target, spot),
      maxPrice = Math.max(...prices, target, spot),
      maxDensity = Math.max(...densities);
    const plotWidth = width - padLeft - padRight,
      plotHeight = height - padTop - padBottom,
      xAt = (price: number) =>
        padLeft + ((price - minPrice) / (maxPrice - minPrice || 1)) * plotWidth,
      yAt = (density: number) => padTop + plotHeight - (density / (maxDensity || 1)) * plotHeight;
    const curvePath = points
      .map(
        (point, index) =>
          `${index ? 'L' : 'M'}${xAt(point.price).toFixed(1)},${yAt(point.density).toFixed(1)}`,
      )
      .join(' ');
    const targetX = xAt(target),
      spotX = xAt(spot),
      baseY = padTop + plotHeight;
    const beyond = points.filter((point) =>
      data.results.direction === 'below' ? point.price <= target : point.price >= target,
    );
    const shadePath =
      beyond.length > 1
        ? `M${xAt(beyond[0].price).toFixed(1)},${baseY} ${beyond.map((point) => `L${xAt(point.price).toFixed(1)},${yAt(point.density).toFixed(1)}`).join(' ')} L${xAt(beyond[beyond.length - 1].price).toFixed(1)},${baseY} Z`
        : '';
    const xLabels = [minPrice, (minPrice + maxPrice) / 2, maxPrice].map((price) => ({
      x: xAt(price),
      label: Math.round(price).toLocaleString('en-IN'),
    }));
    return {
      viewBox: `0 0 ${width} ${height}`,
      curvePath,
      shadePath,
      targetX,
      spotX,
      baseY,
      xLabels,
    };
  }

  private daysBetween(from: string, to: string): number {
    const parse = (value: string) => {
      const [year, month, day] = value.split('-').map(Number);
      return Date.UTC(year, month - 1, day);
    };
    return Math.max(1, Math.round((parse(to) - parse(from)) / 86400000));
  }
}
