import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { EodService } from './eod.service';
import {
  DdGreeksData,
  EodChartPoint,
  EodChartRequest,
  EodDataRow,
  EodPaginatedData,
  EodRequest,
  EodResponse,
  EodSymbol,
} from './eod.model';
import { buildEodChart, ChartResult } from './eod-chart.util';
import { readChartPoints } from './eod-chart-points.util';
import { extractEodPage } from './eod-rows.util';
import { DataTableColumn } from '../../../shared/components/data-table/data-table.types';
import { DataTableComponent } from '../../../shared/components/data-table/data-table.component';
import {
  ChartTooltipComponent,
  ChartTooltipRow,
} from '../../../shared/components/chart-tooltip/chart-tooltip.component';
import { ToastService } from '../../../core/services/toast.service';
import { DefaultStock } from '../../../shared/services/constantFile';
import { CLOSE_EOD_LABEL } from '../../../shared/utils/price-labels';
import { nearestStrike } from '../../../shared/utils/atm-strike';
import { defaultExpiry, isNoExpiriesResponse, selectExpiries } from '../../../shared/utils/expiry-selection';
import { MAX_RANGE_MESSAGE, clearedMessage, exceedsOneYear, fromConflict, fromPickerBounds, isIsoDate, localTodayIso, tillConflict, tillPickerBounds } from '../../../shared/utils/date-range';
import { ExpiryStrikesService } from './expiry-strikes.service';
import { HistoricalUnderlyingService } from './historical-underlying.service';
import { EMPTY, Subject, of } from 'rxjs';
import { catchError, finalize, map, switchMap, takeUntil, tap } from 'rxjs/operators';

const NO_EOD_ROWS: EodResponse = { success: true, data: { results: [], page: 1, has_next: false, has_previous: false } };
const PRICE_FORMAT = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const THOUSANDS_FORMAT = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

@Component({
  selector: 'app-eod',
  standalone: true,
  imports: [CommonModule, DataTableComponent, ChartTooltipComponent],
  templateUrl: './eod.component.html',
  styleUrls: ['./eod.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EodComponent implements OnInit, OnDestroy {
  ranges = ['1W', '1M', '3M', 'Custom'] as const;

  // symbol autocomplete (all F&O symbols from /fo/dd_list)
  symbols: EodSymbol[] = [];
  filteredSymbols: EodSymbol[] = [];
  symbolQuery: string = DefaultStock;
  symbolsLoading = true;
  suggestionsOpen = false;
  highlightedSymbolIndex = -1;

  // filter state
  symbol: EodSymbol = DefaultStock;
  instrument: 'FUT' | 'CE' | 'PE' = 'FUT';
  strike?: number;
  expiry?: string;
  /** Strikes listed for the selected expiry (`dd_strikes`); empty until they have loaded. */
  strikeOptions: number[] = [];
  strikesLoading = false;
  /** Why the strike list is empty or could not be loaded; shown under the Strike control. */
  strikeNote = '';
  /** Why no default strike could be set from the To date's closing price; empty when it could. */
  underlyingNote = '';
  /** True once the strikes of the selected expiry have loaded, so a strike missing from them can be flagged. */
  strikesLoaded = false;
  /** The underlying close of the To date (or the previous session) is being fetched. */
  underlyingLoading = false;
  /** The underlying close the default strike is based on, and the session it belongs to; null when unknown. */
  underlyingClose: number | null = null;
  underlyingSession = '';
  /** The user chose the strike: it is kept (and flagged when the expiry does not list it) instead of following the ATM. */
  private strikePicked = false;
  /** Symbol and expiry / symbol and To date the wanted answer is for; any other answer is stale. */
  private strikesKey = '';
  /** The table request was held back because the expiry list for the new dates is still loading; the list's answer sends it. */
  private tableHeld = false;
  private underlyingKey = '';
  /** Every expiry `dd_expiry` returns for the selected dates, including those after To (see selectExpiries); never derived from today's date. */
  expiryOptions: string[] = [];
  expiryLoading = false;
  /** Why the expiry list is empty or could not be loaded; shown under the Expiry control. */
  expiryNote = '';
  /** Symbol and dates the current expiry list was asked for; an answer for any other key is stale. */
  private expiryKey = '';
  ddGreeksData: DdGreeksData | null = null;
  range: '1W' | '1M' | '3M' | 'Custom' = '1W';
  // custom date range values (YYYY-MM-DD)
  customFrom = '';
  customTill = '';
  /** Why a date was just cleared; shown in place of the generic "select both dates" message. */
  private clearNote = '';
  todayStr = '';

  loading = false;
  isMetadataLoading = false;
  isEodLoading = false;
  error = '';
  rows: EodDataRow[] = [];
  /** `rows` newest first, rebuilt only when `rows` changes so the table gets a stable array. */
  displayRows: EodDataRow[] = [];
  chart: ChartResult | null = null;
  currentPage = 1;
  currentPageSize = 10;
  readonly pageSizes = [10, 25, 50];
  hasNextPage = false;
  hasPreviousPage = false;
  chartTooltip: { index: number; left: number; top: number } | null = null;
  /** The whole selected range from /fo/eod/chart; independent of the table page. */
  chartPoints: EodChartPoint[] = [];
  chartLoading = false;
  chartError = '';
  private chartKey = '';
  /** A request body starts a load; null cancels any load in flight and clears the chart (symbol changed or cleared). */
  private readonly chartRequest$ = new Subject<EodChartRequest | null>();
  private restoreScrollTop: number | null = null;

  readonly eodColumns: DataTableColumn<EodDataRow>[] = [
    { key: 'date', label: 'Date', type: 'text' },
    { key: 'open', label: 'Open', type: 'number', align: 'right' },
    { key: 'high', label: 'High', type: 'number', align: 'right' },
    { key: 'low', label: 'Low', type: 'number', align: 'right' },
    {
      key: 'close',
      label: CLOSE_EOD_LABEL,
      type: 'change',
      align: 'right',
      value: (row) => row.close - row.open,
      formatter: (_value, row) => this.formatPrice(row.close),
    },
    {
      key: 'volume',
      label: 'Volume',
      type: 'text',
      align: 'right',
      formatter: (value) => this.formatThousands(value),
    },
    {
      key: 'oi',
      label: 'OI',
      type: 'text',
      align: 'right',
      formatter: (value) => this.formatThousands(value),
    },
  ];

  private refresh$ = new Subject<{ loadMetadata: boolean }>();
  private expiryRequest$ = new Subject<{ symbol: string; from: string; till: string } | null>();
  private strikesRequest$ = new Subject<{ symbol: string; expiry: string } | null>();
  private underlyingRequest$ = new Subject<{ symbol: string; till: string } | null>();
  private destroy$ = new Subject<void>();

  constructor(
    private readonly svc: EodService,
    private readonly changeDetector: ChangeDetectorRef,
    private readonly toast: ToastService,
    private readonly historicalUnderlying: HistoricalUnderlyingService,
    private readonly expiryStrikes: ExpiryStrikesService,
  ) {}

  ngOnInit(): void {
    // initial defaults
    this.instrument = 'FUT';
    this.symbol = DefaultStock;
    this.symbolQuery = DefaultStock;
    this.range = '1W';
    // today's LOCAL calendar date for the max attribute (toISOString would give yesterday east of UTC)
    this.todayStr = localTodayIso();
    // default custom range to last week
    this.customFrom = this.daysBeforeToday(7);
    this.customTill = this.todayStr;
    this.setupReload();
    this.setupChart();
    this.setupExpiries();
    this.setupStrikes();
    this.loadSymbols();
    this.refresh$.next({ loadMetadata: true });
  }

  private loadSymbols(): void {
    this.svc
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
      });
  }

  private setupReload() {
    this.refresh$
      .pipe(
        takeUntil(this.destroy$),
        tap(({ loadMetadata }) => {
          this.tableHeld = false;
          this.loading = true;
          this.isMetadataLoading = loadMetadata;
          this.isEodLoading = !loadMetadata;
          this.error = '';
          if (loadMetadata) {
            this.cancelChart();
            this.setRows([]);
            this.chart = null;
            this.ddGreeksData = null;
            this.strikeOptions = [];
            this.strikePicked = false;
            this.strikeNote = '';
            this.underlyingNote = '';
            this.strikesLoaded = false;
            this.underlyingClose = null;
            this.underlyingSession = '';
            this.cancelStrikes();
            this.cancelUnderlying();
            this.expiryOptions = [];
            this.expiryNote = '';
            this.cancelExpiries();
            this.strike = undefined;
            this.expiry = undefined;
          }
        }),
        switchMap(({ loadMetadata }) => {
          // Cleared symbol: nothing to load (and any in-flight request is cancelled by switchMap).
          if (!this.symbol) {
            this.loading = false;
            this.isMetadataLoading = false;
            this.isEodLoading = false;
            this.setRows([]);
            this.chart = null;
            this.cancelChart();
            this.changeDetector.markForCheck();
            return EMPTY;
          }
          const metadata$ = loadMetadata
            ? this.svc.getDdGreeks({ symbol: this.symbol }).pipe(
                tap((res) => {
                  this.ddGreeksData = res.data;
                  this.isMetadataLoading = false;
                  this.isEodLoading = true;
                  this.syncExpiries();
                  this.syncUnderlying();
                  this.requestChart();
                }),
              )
            : EMPTY;

          return (
            loadMetadata ? metadata$.pipe(switchMap(() => this.loadEod())) : this.loadEod()
          ).pipe(
            catchError(() => {
              this.isMetadataLoading = false;
              this.isEodLoading = false;
              this.loading = false;
              this.error = loadMetadata ? 'Failed to load EOD metadata' : 'Failed to load EOD data';
              this.toast.error(this.error);
              return EMPTY;
            }),
          );
        }),
      )
      .subscribe((res) => {
        this.isEodLoading = false;
        this.loading = false;
        const paginatedData = this.normalizeEodData(res.data);
        this.currentPage = paginatedData.page;
        this.hasNextPage = paginatedData.has_next;
        this.hasPreviousPage = paginatedData.has_previous;
        this.setRows(
          paginatedData.results
            .map((row) => this.normalizeEodRow(row))
            .sort((a, b) => String(a.date).localeCompare(String(b.date))),
        );
        this.changeDetector.markForCheck();
        this.restorePageScroll();
      });
  }

  /**
   * The chart has its own request (`/fo/eod/chart`: the whole selected range, independent of the table page). It is
   * requested only when a filter changes, never for paging, and switchMap drops a superseded response, so a slow
   * answer for an earlier selection can never replace the current chart. A failure affects only the chart.
   */
  private setupChart(): void {
    this.chartRequest$
      .pipe(
        takeUntil(this.destroy$),
        tap((request) => {
          this.chartLoading = request !== null;
          this.chartError = '';
          this.chart = null;
          this.chartPoints = [];
          this.chartTooltip = null;
          this.changeDetector.markForCheck();
        }),
        switchMap((request) =>
          request === null
            ? EMPTY
            : this.svc.getEodChart(request).pipe(
                map((res) => ({ points: readChartPoints(res.data) })),
                catchError(() => of({ points: null })),
              ),
        ),
      )
      .subscribe(({ points }) => {
        this.chartLoading = false;
        if (points === null) {
          this.chartKey = '';                       // a failed request must be retryable with the same filters
          this.chartError = 'Unable to load the chart.';
        } else {
          this.chartPoints = points;
          this.chart = points.length ? buildEodChart(points) : null;
        }
        this.changeDetector.markForCheck();
      });
  }

  /** Same filters as the table, without paging. Null while the selection is incomplete (nothing is requested). */
  private chartRequestBody(): EodChartRequest | null {
    if (!this.symbol || !this.isChartRangeValid()) return null;
    const option = this.instrument !== 'FUT';
    if (option && (this.strike == null || !this.expiry || this.expiryLoading)) return null;
    const { date_from, date_till } = this.calcDateRange(this.range);
    return {
      symbol: this.symbol,
      option_type: option ? (this.instrument as 'CE' | 'PE') : 'XX',
      date_from,
      date_till,
      ...(option ? { strike: Math.round(this.strike as number), expiry: this.expiry } : {}),
    };
  }

  /** Re-requests the chart when its filters differ from the last request (or after a failure), so repeat clicks cost nothing. */
  private requestChart(force = false): void {
    const body = this.chartRequestBody();
    if (!body) return;
    const key = JSON.stringify(body);
    if (!force && key === this.chartKey) return;
    this.chartKey = key;
    this.chartRequest$.next(body);
  }

  retryChart(): void {
    this.requestChart(true);
  }

  private cancelChart(): void {
    this.chartKey = '';
    this.chartRequest$.next(null);
  }

  private isChartRangeValid(): boolean {
    if (this.range !== 'Custom') return true;
    return Boolean(this.customFrom && this.customTill && isIsoDate(this.customFrom) && isIsoDate(this.customTill)
      && this.customFrom <= this.customTill && this.customTill <= this.todayStr && !exceedsOneYear(this.customFrom, this.customTill));
  }

  /** Payload shape detection is shared with the Multi-Leg EOD screen; the row defaults below stay specific to this screen. */
  private normalizeEodData(data: EodResponse['data']): EodPaginatedData {
    const page = extractEodPage(data);
    return { ...page, results: page.results as EodDataRow[] };
  }

  private normalizeEodRow(row: EodDataRow): EodDataRow {
    const source = row as EodDataRow & {
      trade_date?: string;
      close_price?: number;
    };
    return {
      ...row,
      date: row.date ?? source.trade_date ?? '',
      close: row.close ?? source.close_price ?? 0,
      open: row.open ?? 0,
      high: row.high ?? 0,
      low: row.low ?? 0,
      volume: row.volume ?? 0,
      oi: row.oi ?? 0,
    };
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.refresh$.complete();
  }

  onChartPointer(event: MouseEvent | TouchEvent): void {
    if (!this.chart?.points.length) return;
    const target = event.currentTarget as SVGRectElement;
    const bounds = target.getBoundingClientRect();
    const clientX = 'touches' in event ? event.touches[0]?.clientX : event.clientX;
    const clientY = 'touches' in event ? event.touches[0]?.clientY : event.clientY;
    if (clientX == null || clientY == null || !bounds.width) return;
    const ratio = Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width));
    const index = Math.min(
      this.chart.points.length - 1,
      Math.max(0, Math.round(ratio * (this.chart.points.length - 1))),
    );
    const container = target.parentElement?.parentElement?.getBoundingClientRect();
    if (!container) return;
    this.chartTooltip = {
      index,
      left: Math.max(8, Math.min(container.width - 182, clientX - container.left + 12)),
      top: Math.max(8, clientY - container.top - 70),
    };
  }

  hideChartTooltip(): void {
    this.chartTooltip = null;
  }

  chartTooltipRows(): ChartTooltipRow[] {
    const row = this.chartTooltipRow;
    return row ? [{ label: CLOSE_EOD_LABEL, value: this.formatPrice(row.close), tone: 'neutral' }] : [];
  }
  get chartTooltipRow(): EodChartPoint | undefined {
    if (!this.chart || !this.chartTooltip) return undefined;
    return this.chartPoints[this.chartTooltip.index];
  }

  private loadEod() {
    // While the expiry list for the new dates loads, the selected expiry may not exist for them: hold the request (the loading state stays)
    // and let the list's answer send it, so the table is only ever requested with the latest valid expiry.
    if (this.instrument !== 'FUT' && this.expiryLoading) {
      this.tableHeld = true;
      return EMPTY;
    }
    // An option table needs its strike and expiry: with either still unknown (loading, or none could be set) nothing is requested.
    if (this.instrument !== 'FUT' && (this.strike == null || !this.expiry)) return of(NO_EOD_ROWS);
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

  /** Dates the expiry list is for, or null while the selection is incomplete or invalid (nothing is requested then). */
  private expiryWindow(): { from: string; till: string } | null {
    if (!this.symbol || !this.isChartRangeValid()) return null;
    const { date_from, date_till } = this.calcDateRange(this.range);
    return isIsoDate(date_from) && isIsoDate(date_till) ? { from: date_from, till: date_till } : null;
  }

  private cancelExpiries(): void {
    this.expiryKey = '';
    this.expiryLoading = false;
    if (this.tableHeld) {
      // Nothing will answer for these dates any more: do not leave the table loading.
      this.tableHeld = false;
      this.loading = false;
      this.isEodLoading = false;
    }
    this.expiryRequest$.next(null);
  }

  /**
   * Asks `/fo/dd_expiry` for the symbol's expiries in the selected dates, once per symbol and dates.
   */
  private syncExpiries(): void {
    const window = this.expiryWindow();
    if (!window) {
      this.cancelExpiries();
      return;
    }
    const key = `${this.symbol}|${window.from}|${window.till}`;
    if (key === this.expiryKey) return;
    this.expiryKey = key;
    this.expiryLoading = true;
    this.expiryNote = '';
    this.expiryRequest$.next({ symbol: this.symbol, ...window });
    this.changeDetector.markForCheck();
  }

  private setupExpiries(): void {
    this.expiryRequest$
      .pipe(
        takeUntil(this.destroy$),
        switchMap((request) => {
          if (!request) return of(null);
          const key = `${request.symbol}|${request.from}|${request.till}`;
          return this.svc.getDdExpiry({ symbol: request.symbol, trade_from: request.from, trade_till: request.till }).pipe(
            map((response) => ({ key, request, dates: response.data?.expiry_date as unknown, failed: false })),
            catchError((error) => of({ key, request, dates: [] as unknown, failed: !isNoExpiriesResponse(error) })),
          );
        }),
      )
      .subscribe((result) => {
        if (!result || result.key !== this.expiryKey) return;
        this.expiryLoading = false;
        const { from, till } = result.request;
        const previous = this.expiry;
        this.expiryOptions = result.failed ? [] : selectExpiries(Array.isArray(result.dates) ? result.dates : []);
        this.expiryNote = result.failed
          ? 'Unable to load expiries for these dates.'
          : this.expiryOptions.length ? '' : 'No expiries are listed for these dates.';
        if (result.failed) this.toast.error(this.expiryNote);
        // Keep the user's expiry when it is still offered; otherwise the most recent one inside the dates.
        this.expiry = previous && this.expiryOptions.includes(previous) ? previous : defaultExpiry(this.expiryOptions, from, till);
        // The table and chart were held back while the list loaded: send them now, with the expiry that is valid for these dates.
        if (this.instrument !== 'FUT') this.resetPageAndRefresh();
        this.syncStrikes();
        this.changeDetector.markForCheck();
      });
  }

  /** Asks for the underlying close of the To date (the previous session when it was not a trading day): once per symbol and To date. */
  private syncUnderlying(): void {
    const window = this.expiryWindow();
    if (!window) {
      this.cancelUnderlying();
      return;
    }
    const key = `${this.symbol}|${window.till}`;
    if (key === this.underlyingKey) return;
    this.underlyingKey = key;
    this.underlyingClose = null;
    this.underlyingSession = '';
    this.underlyingNote = '';
    this.underlyingLoading = true;
    this.underlyingRequest$.next({ symbol: this.symbol, till: window.till });
    this.applyDefaultStrike();   // no close is known any more: an untouched strike must not keep following the previous one
    this.changeDetector.markForCheck();
  }

  private cancelUnderlying(): void {
    this.underlyingKey = '';
    this.underlyingLoading = false;
    this.underlyingRequest$.next(null);
  }

  /** Asks `dd_strikes` for the selected expiry's strikes, once per symbol and expiry. Futures have no strike, so nothing is asked for them. */
  private syncStrikes(): void {
    if (!this.symbol || !this.expiry || this.instrument === 'FUT') {
      if (this.instrument === 'FUT' || !this.expiry) this.cancelStrikes();
      return;
    }
    const key = `${this.symbol}|${this.expiry}`;
    if (key === this.strikesKey) return;
    this.strikesKey = key;
    this.strikeOptions = [];
    this.strikesLoaded = false;
    this.strikeNote = '';
    this.strikesLoading = true;
    this.strikesRequest$.next({ symbol: this.symbol, expiry: this.expiry });
    this.applyDefaultStrike();
    this.changeDetector.markForCheck();
  }

  private cancelStrikes(): void {
    this.strikesKey = '';
    this.strikesLoading = false;
    this.strikesRequest$.next(null);
  }

  private setupStrikes(): void {
    this.strikesRequest$
      .pipe(
        takeUntil(this.destroy$),
        switchMap((request) => (request
          ? this.expiryStrikes.resolve(request.symbol, request.expiry).pipe(map((result) => ({ key: `${request.symbol}|${request.expiry}`, expiry: request.expiry, result })))
          : of(null))),
      )
      .subscribe((answer) => {
        if (!answer || answer.key !== this.strikesKey) return;
        this.strikesLoading = false;
        const { result, expiry } = answer;
        this.strikeOptions = result.ok ? result.strikes : [];
        this.strikesLoaded = result.ok;
        this.strikeNote = result.ok ? '' : result.reason === 'none'
          ? 'No strikes are listed for this expiry.'
          : 'Unable to load the strikes for this expiry.';
        if (!result.ok && result.reason === 'unavailable') this.toast.error(`Unable to load the strikes for the ${expiry} expiry.`);
        this.applyDefaultStrike();
        this.changeDetector.markForCheck();
      });

    this.underlyingRequest$
      .pipe(
        takeUntil(this.destroy$),
        switchMap((request) => (request
          ? this.historicalUnderlying.resolve(request.symbol, request.till).pipe(map((result) => ({ key: `${request.symbol}|${request.till}`, till: request.till, result })))
          : of(null))),
      )
      .subscribe((answer) => {
        if (!answer || answer.key !== this.underlyingKey) return;
        this.underlyingLoading = false;
        if (answer.result.ok) {
          this.underlyingClose = answer.result.underlying;
          this.underlyingSession = answer.result.session;
        } else {
          // Never the current price: without the close there is no default strike, and the user is told why.
          this.underlyingClose = null;
          this.underlyingSession = '';
          this.underlyingNote = answer.result.reason === 'no-session'
            ? `No trading session was found on or before ${answer.till}, so the ATM strike could not be set. Select a strike.`
            : `Unable to load the closing price for ${answer.till}, so the ATM strike could not be set. Select a strike.`;
          this.toast.error(this.underlyingNote);
        }
        this.applyDefaultStrike();
        this.changeDetector.markForCheck();
      });
  }

  /**
   * An untouched strike is the listed strike of the selected expiry nearest the underlying close of the To date; none while either is unknown.
   * A strike the user chose is never changed. Option tables reload when the strike changed.
   */
  private applyDefaultStrike(): void {
    if (this.strikePicked) return;
    const target = nearestStrike(this.strikeOptions, this.underlyingClose) ?? undefined;
    if (target === this.strike) return;
    this.strike = target;
    if (this.instrument !== 'FUT' && !this.isMetadataLoading) this.resetPageAndRefresh();
  }

  private setRows(rows: EodDataRow[]): void {
    this.rows = rows;
    this.displayRows = rows.slice().reverse();
  }

  get displayColumns(): DataTableColumn<EodDataRow>[] {
    return this.eodColumns;
  }

  private formatPrice(value: number): string {
    return PRICE_FORMAT.format(value);
  }

  private formatThousands(value: unknown): string {
    const numericValue = typeof value === 'number' ? value : Number(value);
    return `${THOUSANDS_FORMAT.format(numericValue / 1000)}K`;
  }

  private calcDateRange(range: string) {
    const today = new Date();
    const till = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    if (range === 'Custom') {
      // customFrom/till are already YYYY-MM-DD from input
      return {
        date_from: this.customFrom || fmt(new Date(till.getTime() - 7 * 86400000)),
        date_till: this.customTill || fmt(till),
      };
    }
    let from = new Date(till);
    if (range === '1W') from.setDate(till.getDate() - 7);
    else if (range === '1M') from.setMonth(till.getMonth() - 1);
    else if (range === '3M') from.setMonth(till.getMonth() - 3);
    return { date_from: fmt(from), date_till: fmt(till) };
  }

  onSymbol(sym: EodSymbol) {
    this.symbol = sym;
    this.currentPage = 1;
    this.refresh$.next({ loadMetadata: true });
  }

  /* ---------- symbol autocomplete (same behaviour as the calculator screens) ---------- */

  onSymbolInput(event?: Event): void {
    if (event) this.symbolQuery = (event.target as HTMLInputElement).value;
    const query = this.symbolQuery.trim().toLowerCase();
    this.filteredSymbols = query
      ? this.symbols.filter((symbol) => symbol.toLowerCase().includes(query))
      : this.symbols;
    this.suggestionsOpen = true;
    this.highlightedSymbolIndex = -1;
  }

  selectSymbol(symbol: string): void {
    if (!this.symbols.includes(symbol)) return;
    this.symbolQuery = symbol;
    this.suggestionsOpen = false;
    this.highlightedSymbolIndex = -1;
    if (symbol !== this.symbol) this.onSymbol(symbol);
  }

  clearSymbol(): void {
    this.symbolQuery = '';
    this.filteredSymbols = this.symbols;
    this.suggestionsOpen = false;
    this.highlightedSymbolIndex = -1;
    this.onSymbol('');
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
        this.highlightedSymbolIndex <= 0 ? this.filteredSymbols.length - 1 : this.highlightedSymbolIndex - 1;
    } else if (event.key === 'Enter') {
      event.preventDefault();
      this.selectSymbol(this.filteredSymbols[Math.max(0, this.highlightedSymbolIndex)]);
    } else if (event.key === 'Escape') {
      this.suggestionsOpen = false;
    }
  }

  onSymbolBlur(): void {
    window.setTimeout(() => {
      this.suggestionsOpen = false;
      // Text that is not a listed symbol reverts to the active selection.
      if (this.symbolQuery !== this.symbol) this.symbolQuery = this.symbol;
      this.changeDetector.markForCheck();
    }, 150);
  }
  onInstrument(inst: 'FUT' | 'CE' | 'PE') {
    this.instrument = inst;
    this.resetPageAndRefresh();
  }
  onStrikeChange(event: Event) {
    const value = Number((event.target as HTMLSelectElement).value);
    if (Number.isFinite(value)) this.onStrike(value);
  }

  onExpiryChange(event: Event) {
    this.onExpiry((event.target as HTMLSelectElement).value);
  }

  onStrike(s: number) {
    this.strike = s;
    this.strikePicked = true;
    this.resetPageAndRefresh();
  }
  onExpiry(e: string) {
    this.expiry = e;
    this.resetPageAndRefresh();
  }
  onRange(r: '1W' | '1M' | '3M' | 'Custom') {
    this.range = r;
    this.clearNote = '';
    if (r === 'Custom') {
      // ensure defaults exist and validate
      if (!this.customFrom) this.customFrom = this.daysBeforeToday(7);
      if (!this.customTill) this.customTill = this.todayStr;
      this.applyCustomDates();
    } else {
      this.resetPageAndRefresh();
    }
  }

  /** A new From date is never refused; a To date that no longer fits it (earlier, or over a year later) is cleared to be picked again. */
  onCustomFromChange(value: Event | string) {
    this.onCustomFrom(typeof value === 'string' ? value : (value.target as HTMLInputElement).value);
    this.clearNote = '';
    const conflict = tillConflict(this.customFrom, this.customTill);
    if (conflict) {
      this.customTill = '';
      this.clearNote = clearedMessage('To', conflict);
    }
    this.applyCustomDates();
  }

  /** Mirror of onCustomFromChange: a From date that no longer fits the new To date is cleared. */
  onCustomTillChange(value: Event | string) {
    this.onCustomTill(typeof value === 'string' ? value : (value.target as HTMLInputElement).value);
    this.clearNote = '';
    const conflict = fromConflict(this.customFrom, this.customTill);
    if (conflict) {
      this.customFrom = '';
      this.clearNote = clearedMessage('From', conflict);
    }
    this.applyCustomDates();
  }

  /** The custom From/To dates apply as soon as they form a valid range. */
  private applyCustomDates(): void {
    if (this.validateCustomDates()) this.resetPageAndRefresh();
    else this.cancelExpiries();   // no valid dates: a list still loading for the previous dates is no longer wanted
  }

  onCustomFrom(val: string) {
    this.customFrom = val;
  }

  onCustomTill(val: string) {
    this.customTill = val;
  }

  private refreshEod(): void {
    if (!this.isMetadataLoading) {
      this.restoreScrollTop = window.scrollY;
      this.refresh$.next({ loadMetadata: false });
    }
  }

  /** A control's options are being refreshed: it shows a spinner and stays disabled. */
  get strikeBusy(): boolean {
    return this.isMetadataLoading || this.strikesLoading || this.underlyingLoading;
  }

  /** The strike marked (ATM): the listed strike of the selected expiry nearest the underlying close. Null until both are known; it does not follow the user's choice. */
  get atmStrike(): number | null {
    return nearestStrike(this.strikeOptions, this.underlyingClose);
  }

  get expiryBusy(): boolean {
    return this.isMetadataLoading || this.expiryLoading;
  }

  private restorePageScroll(): void {
    if (this.restoreScrollTop === null) return;
    const scrollTop = this.restoreScrollTop;
    this.restoreScrollTop = null;
    window.requestAnimationFrame(() => window.scrollTo({ top: scrollTop, behavior: 'auto' }));
  }

  private resetPageAndRefresh(): void {
    this.currentPage = 1;
    if (!this.isMetadataLoading) {
      this.syncExpiries();   // the dates may have changed: the expiry list follows them
      this.syncUnderlying();
      this.syncStrikes();
    }
    this.refreshEod();
    if (!this.isMetadataLoading) this.requestChart();   // a filter changed; paging (below) never touches the chart
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
    if (!this.customFrom || !this.customTill) {
      this.error = this.clearNote || 'Select both start and end dates';
      return false;
    }
    if (!isIsoDate(this.customFrom) || !isIsoDate(this.customTill)) {
      this.error = 'Enter valid dates';
      return false;
    }
    // no future dates
    const today = new Date(this.todayStr + 'T00:00:00');
    const from = new Date(this.customFrom + 'T00:00:00');
    const till = new Date(this.customTill + 'T00:00:00');
    if (from > today || till > today) {
      this.error = 'Dates cannot be in the future';
      return false;
    }
    if (from > till) {
      this.error = 'Start date cannot be after end date';
      return false;
    }
    if (exceedsOneYear(this.customFrom, this.customTill)) {
      this.error = MAX_RANGE_MESSAGE;
      return false;
    }
    return true;
  }

  /** Picker limits: a chosen date is never blocked by the other one; an empty date is narrowed to the valid window. */
  get customFromBounds() { return fromPickerBounds(this.customFrom, this.customTill, this.todayStr); }
  get customTillBounds() { return tillPickerBounds(this.customFrom, this.customTill, this.todayStr); }

  private daysBeforeToday(days: number): string {
    const d = new Date(`${this.todayStr}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - days);
    return d.toISOString().slice(0, 10);
  }

  /**
   * SYMBOL_EXPIRY_STRIKE_OPTIONTYPE.csv from the applied selection (e.g. NIFTY_2026-10-13_22600_CE.csv).
   * Futures have no strike/option type, so only the parts that exist are used (SYMBOL_FUT.csv);
   * missing parts are omitted, never invented.
   */
  private csvFilename(): string {
    const clean = (part: string) => part.trim().replace(/[\\/:*?"<>|\s]+/g, '-');
    const isOption = this.instrument === 'CE' || this.instrument === 'PE';
    const parts = isOption
      ? [
          this.symbol,
          this.expiry?.slice(0, 10),
          this.strike != null ? String(Math.round(this.strike)) : undefined,
          this.instrument,
        ]
      : [this.symbol, this.instrument];
    const name = parts
      .filter((part): part is string => !!part)
      .map(clean)
      .join('_');
    return `${name}.csv`;
  }

  downloadCsv() {
    if (!this.rows || this.rows.length === 0) {
      this.toast.error('There is no EOD data available to download.');
      return;
    }
    try {
      const header = 'Date,Open,High,Low,Close,Volume,OI\n';
      const body = this.rows
        .map((r) =>
          [
            r.date,
            r.open.toFixed(2),
            r.high.toFixed(2),
            r.low.toFixed(2),
            r.close.toFixed(2),
            Math.round(r.volume),
            Math.round(r.oi),
          ].join(','),
        )
        .join('\n');
      const filename = this.csvFilename();
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
