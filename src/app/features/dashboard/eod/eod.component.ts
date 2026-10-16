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
  EodDataRow,
  EodPaginatedData,
  EodRequest,
  EodResponse,
  EodSymbol,
} from './eod.model';
import { buildEodChart, ChartResult } from './eod-chart.util';
import { DataTableColumn } from '../../../shared/components/data-table/data-table.types';
import { DataTableComponent } from '../../../shared/components/data-table/data-table.component';
import {
  ChartTooltipComponent,
  ChartTooltipRow,
} from '../../../shared/components/chart-tooltip/chart-tooltip.component';
import { ToastService } from '../../../core/services/toast.service';
import { DefaultStock } from '../../../shared/services/constantFile';
import { EMPTY, Subject, of } from 'rxjs';
import { catchError, finalize, switchMap, takeUntil, tap } from 'rxjs/operators';

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
  strikeOptions: number[] = [];
  expiryOptions: string[] = [];
  ddGreeksData: DdGreeksData | null = null;
  range: '1W' | '1M' | '3M' | 'Custom' = '1W';
  // custom date range values (YYYY-MM-DD)
  customFrom = '';
  customTill = '';
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
  chartTooltip: { index: number; left: number; top: number } | null = null;
  private restoreScrollTop: number | null = null;

  readonly eodColumns: DataTableColumn<EodDataRow>[] = [
    { key: 'date', label: 'Date', type: 'text' },
    { key: 'open', label: 'Open', type: 'number', align: 'right' },
    { key: 'high', label: 'High', type: 'number', align: 'right' },
    { key: 'low', label: 'Low', type: 'number', align: 'right' },
    {
      key: 'close',
      label: 'Close',
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
  private destroy$ = new Subject<void>();

  constructor(
    private readonly svc: EodService,
    private readonly changeDetector: ChangeDetectorRef,
    private readonly toast: ToastService,
  ) {}

  ngOnInit(): void {
    // initial defaults
    this.instrument = 'FUT';
    this.symbol = DefaultStock;
    this.symbolQuery = DefaultStock;
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
          this.loading = true;
          this.isMetadataLoading = loadMetadata;
          this.isEodLoading = !loadMetadata;
          this.error = '';
          if (loadMetadata) {
            this.rows = [];
            this.chart = null;
            this.ddGreeksData = null;
            this.strikeOptions = [];
            this.expiryOptions = [];
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
            this.rows = [];
            this.chart = null;
            this.changeDetector.markForCheck();
            return EMPTY;
          }
          const metadata$ = loadMetadata
            ? this.svc.getDdGreeks({ symbol: this.symbol }).pipe(
                tap((res) => {
                  this.ddGreeksData = res.data;
                  this.strikeOptions = res.data.strike ?? [];
                  this.expiryOptions = this.parseExpiries(res.data.expiry_date);
                  this.strike = this.selectDefaultStrike(res.data.strike, res.data.atm_strike);
                  this.expiry = this.expiryOptions[0];
                  this.isMetadataLoading = false;
                  this.isEodLoading = true;
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
        this.rows = paginatedData.results
          .map((row) => this.normalizeEodRow(row))
          .sort((a, b) => String(a.date).localeCompare(String(b.date)));
        this.chart = buildEodChart(this.rows.slice(-200));
        this.changeDetector.markForCheck();
        this.restorePageScroll();
      });
  }

  private normalizeEodData(data: EodResponse['data']): EodPaginatedData {
    const payload = data as unknown;
    if (Array.isArray(payload)) {
      return { results: payload as EodDataRow[], page: 1, has_next: false, has_previous: false };
    }
    if (!payload || typeof payload !== 'object') {
      return { results: [], page: 1, has_next: false, has_previous: false };
    }
    const value = payload as {
      results?: unknown;
      rows?: unknown;
      items?: unknown;
      data?: unknown;
      page?: unknown;
      has_next?: unknown;
      has_previous?: unknown;
    };
    if (value.data && typeof value.data === 'object' && !Array.isArray(value.data)) {
      const nested = value.data as {
        results?: unknown;
        rows?: unknown;
        items?: unknown;
        data?: unknown;
      };
      if (
        Array.isArray(nested.results) ||
        Array.isArray(nested.rows) ||
        Array.isArray(nested.items) ||
        Array.isArray(nested.data)
      ) {
        return this.normalizeEodData(value.data as EodResponse['data']);
      }
    }
    const results = Array.isArray(value.results)
      ? value.results
      : Array.isArray(value.rows)
        ? value.rows
        : Array.isArray(value.items)
          ? value.items
          : Array.isArray(value.data)
            ? value.data
            : [];
    return {
      results: results as EodDataRow[],
      page: typeof value.page === 'number' ? value.page : 1,
      has_next: value.has_next === true,
      has_previous: value.has_previous === true,
    };
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
    return row ? [{ label: 'Close', value: this.formatPrice(row.close), tone: 'neutral' }] : [];
  }
  get chartTooltipRow(): EodDataRow | undefined {
    if (!this.chart || !this.chartTooltip) return undefined;
    return this.rows[this.rows.length - this.chart.points.length + this.chartTooltip.index];
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

  /** `expiry_date` was a single string and is now an array; both become a sorted list of unique YYYY-MM-DD dates. */
  private parseExpiries(raw: DdGreeksData['expiry_date'] | null | undefined): string[] {
    const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const dates = values
      .map((value) => String(value).slice(0, 10))
      .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value));
    return [...new Set(dates)].sort();
  }

  private selectDefaultStrike(strikes: number[], atmStrike: number): number | undefined {
    return strikes.includes(atmStrike) ? atmStrike : strikes[0];
  }

  get displayRows(): EodDataRow[] {
    return this.rows.slice().reverse();
  }

  get displayColumns(): DataTableColumn<EodDataRow>[] {
    return this.eodColumns;
  }

  private formatPrice(value: number): string {
    return new Intl.NumberFormat('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
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
    this.resetPageAndRefresh();
  }
  onExpiry(e: string) {
    this.expiry = e;
    this.resetPageAndRefresh();
  }
  onRange(r: '1W' | '1M' | '3M' | 'Custom') {
    this.range = r;
    if (r === 'Custom') {
      // ensure defaults exist and validate
      if (!this.customFrom) {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        this.customFrom = d.toISOString().slice(0, 10);
      }
      if (!this.customTill) {
        const d = new Date();
        this.customTill = d.toISOString().slice(0, 10);
      }
      this.applyCustomDates();
    } else {
      this.resetPageAndRefresh();
    }
  }

  onCustomFromChange(value: Event | string) {
    this.onCustomFrom(typeof value === 'string' ? value : (value.target as HTMLInputElement).value);
    this.applyCustomDates();
  }

  onCustomTillChange(value: Event | string) {
    this.onCustomTill(typeof value === 'string' ? value : (value.target as HTMLInputElement).value);
    this.applyCustomDates();
  }

  /** The custom From/To dates apply as soon as they form a valid range. */
  private applyCustomDates(): void {
    if (this.validateCustomDates()) this.resetPageAndRefresh();
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

  private restorePageScroll(): void {
    if (this.restoreScrollTop === null) return;
    const scrollTop = this.restoreScrollTop;
    this.restoreScrollTop = null;
    window.requestAnimationFrame(() => window.scrollTo({ top: scrollTop, behavior: 'auto' }));
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
    if (!this.customFrom || !this.customTill) {
      this.error = 'Select both start and end dates';
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
    return true;
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
