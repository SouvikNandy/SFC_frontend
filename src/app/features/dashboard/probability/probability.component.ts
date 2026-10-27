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
  combineLatest,
  debounceTime,
  finalize,
  map,
  of,
  switchMap,
  takeUntil,
  tap,
} from 'rxjs';
import { DataTableComponent } from '../../../shared/components/data-table/data-table.component';
import { DataTableColumn } from '../../../shared/components/data-table/data-table.types';
import { ToastService } from '../../../core/services/toast.service';
import { DefaultStock } from '../../../shared/services/constantFile';
import { daysToExpiry, expiryNote } from '../../../shared/utils/expiry';
import { atmImpliedVolatility, AtmIv } from '../../../shared/pricing/atm-iv';
import { PricingContextService, describePricingFailure } from '../../../shared/pricing/pricing-context.service';
import { OptionsChainService } from '../options-chain/options-chain.service';
import { formatDisplayDate } from '../../../shared/utils/date-format';
import { GreeksSymbolDetails } from '../greeks/greeks.model';
import { ProbabilityService } from './probability.service';
import { ChartTooltipComponent, ChartTooltipRow } from '../../../shared/components/chart-tooltip/chart-tooltip.component';
import { ActivatedRoute } from '@angular/router';
import { LiveDataAccessComponent } from '../live-data/live-data-access.component';
import { LiveDataAccessService } from '../live-data/live-data-access.service';
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
  imports: [CommonModule, ReactiveFormsModule, DataTableComponent, ChartTooltipComponent, LiveDataAccessComponent],
  templateUrl: './probability.component.html',
  styleUrl: './probability.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProbabilityComponent implements OnInit, OnDestroy {
  private readonly probability = inject(ProbabilityService);
  private readonly chains = inject(OptionsChainService);
  private readonly pricing = inject(PricingContextService);
  /** Request for the at-the-money implied volatility of one expiry; null cancels and clears. */
  private readonly atmRequest$ = new Subject<{ symbol: string; expiry: string } | null>();
  private readonly toast = inject(ToastService);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly route = inject(ActivatedRoute);
  private readonly liveAccess = inject(LiveDataAccessService);
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
  sourceNote = '';
  /** Expiry date the day count was derived from; empty in Custom mode or once the days are typed by hand. */
  expiryDate = '';
  error = '';
  data: ProbabilityApiData | null = null;
  chart: ProbabilityChart | null = null;
  detailRows: ProbabilityDetailRow[] = [];
  chartTooltip: { index: number; left: number; top: number } | null = null;
  /**
   * EOD mode volatility: the at-the-money implied volatility of the selected expiry, solved from the Close (EOD) of the
   * call and put at the strike nearest the pricing underlying (average of the sides that solve). Never HV-20.
   */
  atmIv: AtmIv | null = null;
  atmStatus: 'idle' | 'loading' | 'ready' | 'unavailable' = 'idle';
  atmNote = '';
  get volHint(): string {
    if (this.modeControl.value === 'custom') return 'Entered manually';
    if (this.atmStatus === 'loading') return 'Solving the at-the-money implied volatility…';
    if (this.atmStatus === 'unavailable') return this.atmNote;
    const atm = this.atmIv;
    if (!atm) return '';
    const part = (label: string, value: number | null) => (value === null ? null : `${label} ${value.toFixed(2)}%`);
    return `ATM implied volatility, strike ${atm.strike}: ${[part('call', atm.callPct), part('put', atm.putPct)].filter(Boolean).join(' · ')} (from Close (EOD))`;
  }
  private symbolsRequested = false;

  ngOnInit(): void {
    if (this.liveAccess.requestedLive(this.route.snapshot)) this.modeControl.setValue('live', { emitEvent: false });
    // Subscribe before loading: the cached symbol list emits synchronously and would otherwise be lost.
    this.setupSymbolDetails();
    this.setupAtmIv();
    this.setupCalculation();
    // Live Data is a separate view: symbol/EOD APIs load only when EOD or Custom is opened.
    if (this.modeControl.value !== 'live') this.loadSymbols();
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
    if (mode === 'live') {
      // Cancel any in-flight EOD request; EOD reloads when its tab is reopened.
      this.symbolSelection$.next('');
      this.atmRequest$.next(null);
      return;
    }
    if (!this.symbolsRequested) this.loadSymbols();
    if (mode === 'custom') {
      this.sourceNote = 'Manual entry';
      this.symbolDetails = null;
      this.expiryDate = '';
      this.atmRequest$.next(null);
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
    this.expiryDate = '';
    this.atmRequest$.next(null);
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
    return value == null || !Number.isFinite(value) ? '–' : `${value.toFixed(2)}%`;
  }
  formatPrice(value: number | null | undefined): string {
    return value == null || !Number.isFinite(value)
      ? '–'
      : `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  }

  private loadSymbols(): void {
    this.symbolsRequested = true;
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
        if (!initialSymbol) return;
        if (this.modeControl.value === 'eod') this.selectSymbol(initialSymbol);
        else if (!this.symbolControl.value) this.symbolControl.setValue(initialSymbol, { emitEvent: false });
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
          this.expiryDate = '';
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
          if (this.modeControl.value === 'eod' && this.atmStatus !== 'ready') {
            // No volatility yet (loading) or none available: say why, never substitute HV-20.
            this.calculating = false;
            this.data = null;
            this.chart = null;
            this.detailRows = [];
            this.error = ''; // the reason is shown under the volatility field (volHint)
            this.changeDetector.markForCheck();
            return EMPTY;
          }
          const request = this.buildRequest();
          if (!request) {
            this.calculating = false;
            this.data = null;
            this.chart = null;
            this.detailRows = [];
            return EMPTY;
          }
          this.calculating = true;
          // Every mode uses the shared frontend calculation; the backend result ignores the supplied volatility.
          return of(null).pipe(
            map(() => this.probability.calculate(request)),
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
    this.expiryDate = this.firstExpiryDate(details);
    this.sourceNote = `Values below refresh from your selection · ${details.trade_date}`;
    const target =  Math.round(details.underlying);
    const expiry = this.resolveExpiryDays(details);
    this.form.patchValue(
      { spot: Math.round(details.underlying), target, expiry, vol: 0 }, // volatility is filled once the ATM implied volatility is solved
      { emitEvent: false },
    );
    this.loadAtmIv();
    this.calculate();
  }

  /** Calendar days from today (IST) to the first listed expiry date (0 on expiry day). */
  private resolveExpiryDays(details: GreeksSymbolDetails): number {
    const expiry = this.firstExpiryDate(details);
    const days = expiry ? daysToExpiry(expiry) : Number.NaN;
    return Number.isFinite(days) ? days : 0;
  }

  private loadAtmIv(): void {
    const symbol = this.symbolControl.value;
    this.atmRequest$.next(this.modeControl.value === 'eod' && symbol && this.expiryDate ? { symbol, expiry: this.expiryDate } : null);
  }

  private setupAtmIv(): void {
    this.atmRequest$
      .pipe(
        takeUntil(this.destroy$),
        tap((request) => {
          this.atmIv = null;
          this.atmNote = '';
          this.atmStatus = request ? 'loading' : 'idle';
          if (request) this.volControl.setValue(0, { emitEvent: false });
          this.changeDetector.markForCheck();
        }),
        switchMap((request) =>
          request
            ? combineLatest({
                view: this.chains.getOptionChain(request),
                context: this.pricing.resolve(request.symbol, request.expiry, this.symbolDetails?.underlying),
              }).pipe(
                catchError(() => {
                  this.atmStatus = 'unavailable';
                  this.atmNote = 'The option chain is unavailable, so the at-the-money implied volatility cannot be solved. Switch to Custom to enter a volatility.';
                  this.changeDetector.markForCheck();
                  this.calculate();
                  return EMPTY;
                }),
                map((result) => ({ ...result, expiry: request.expiry })),
              )
            : EMPTY,
        ),
      )
      .subscribe(({ view, context, expiry }) => {
        if (!context.ok) {
          this.atmStatus = 'unavailable';
          this.atmNote = describePricingFailure(context.reason);
        } else {
          const days = daysToExpiry(expiry);
          const found = atmImpliedVolatility(context, view.rows.map((row) => ({ strike: row.strike, callClose: row.call.ltp, putClose: row.put.ltp })), days);
          if (found) {
            this.atmIv = found;
            this.atmStatus = 'ready';
            this.volControl.setValue(Math.round(found.averagePct * 100) / 100, { emitEvent: false });
          } else {
            this.atmStatus = 'unavailable';
            this.atmNote = days > 0 ? 'No at-the-money contract has a Close (EOD) that yields an implied volatility.' : describePricingFailure('no-time-to-expiry');
          }
        }
        this.changeDetector.markForCheck();
        this.calculate();
      });
  }

  private firstExpiryDate(details: GreeksSymbolDetails): string {
    const raw = Array.isArray(details.expiry_date) ? details.expiry_date[0] : details.expiry_date;
    return typeof raw === 'string' && Number.isFinite(daysToExpiry(raw)) ? raw : '';
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
      vol = Number(this.volControl.value);
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
    if (!Number.isFinite(vol) || vol <= 0) {
      this.error = 'Volatility must be greater than 0%.';
      return null;
    }
    if (vol > 1000) {
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
    return { symbol, spot: Math.round(spot), target, expiry, vol };
  }

  private buildDetailRows(data: ProbabilityApiData): ProbabilityDetailRow[] {
    const results = data.results;
    return [
      {
        label: '1 s.d. range at expiry',
        description: 'About 68% of outcomes fall in this band',
        value: `${this.formatPrice(results.oneSdLower)} – ${this.formatPrice(results.oneSdUpper)}`,
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
    const chartPoints = points.map((point) => ({ ...point, x: xAt(point.price), y: yAt(point.density) }));
    const curvePath = chartPoints
      .map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)},${point.y.toFixed(1)}`)
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
      points: chartPoints,
    };
  }

  onChartPointer(event: MouseEvent | TouchEvent): void {
    if (!this.chart?.points.length) return;
    const target = event.currentTarget as SVGRectElement, bounds = target.getBoundingClientRect();
    const clientX = 'touches' in event ? event.touches[0]?.clientX : event.clientX;
    const clientY = 'touches' in event ? event.touches[0]?.clientY : event.clientY;
    if (clientX == null || clientY == null || !bounds.width) return;
    const ratio = Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width));
    const index = Math.min(this.chart.points.length - 1, Math.max(0, Math.round(ratio * (this.chart.points.length - 1))));
    const container = target.parentElement?.parentElement?.getBoundingClientRect();
    if (!container) return;
    this.chartTooltip = { index, left: Math.max(8, Math.min(container.width - 182, clientX - container.left + 12)), top: Math.max(8, clientY - container.top - 70) };
  }
  hideChartTooltip(): void { this.chartTooltip = null; }
  chartTooltipRows(): ChartTooltipRow[] {
    const point = this.chart?.points[this.chartTooltip?.index ?? -1];
    return point ? [{ label: 'Probability density', value: point.density.toFixed(4), tone: 'neutral' }] : [];
  }
  chartTooltipTitle(): string {
    const point = this.chart?.points[this.chartTooltip?.index ?? -1];
    return point ? `Price ${Math.round(point.price).toLocaleString('en-IN')}` : 'Price distribution';
  }

  onExpiryInput(): void {
    this.expiryDate = ''; // a hand-edited day count no longer belongs to the loaded expiry date
    this.onFieldChange();
  }

  get expiryDisplayNote(): string {
    return expiryNote(this.expiryDate);
  }
}
