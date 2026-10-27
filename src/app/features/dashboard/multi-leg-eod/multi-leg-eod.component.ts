import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CLOSE_EOD_LABEL } from '../../../shared/utils/price-labels';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, Subject, catchError, finalize, forkJoin, map, of, shareReplay, switchMap, tap } from 'rxjs';
import { ToastService } from '../../../core/services/toast.service';
import { ChartTooltipComponent, ChartTooltipRow } from '../../../shared/components/chart-tooltip/chart-tooltip.component';
import { DataTableComponent } from '../../../shared/components/data-table/data-table.component';
import { DataTableColumn } from '../../../shared/components/data-table/data-table.types';
import { DefaultStock } from '../../../shared/services/constantFile';
import { clearedMessage, fromConflict, fromPickerBounds, tillConflict, tillPickerBounds } from '../../../shared/utils/date-range';
import { EodDataRow } from '../eod/eod.model';
import { EodService } from '../eod/eod.service';
import { isNoTradeBar } from '../eod/eod-rows.util';
import { deriveStrikeStep } from '../payoff/payoff-strategies';
import {
  CombinedTableRow,
  DateRange,
  LegOptionType,
  LegSelection,
  LegSeries,
  RangePreset,
  SingleLegTableRow,
} from './multi-leg-eod.model';
import {
  buildLegChart,
  buildSessions,
  combinedCsv,
  combinedRows,
  csvFilename,
  isLegComplete,
  legCacheKey,
  PRESET_SESSIONS,
  legLabel,
  longDate,
  pageSlice,
  resolveRange,
  singleLegCsv,
  singleLegRows,
  ymd,
} from './multi-leg-eod.util';

const NARROW_QUERY = '(max-width: 700px)';
const MAX_LEGS = 6;
const PAGE_SIZES = [10, 25, 50] as const;
const PRICE = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const KILO = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const todayUtc = (): string => {
  const now = new Date();
  return ymd(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
};

@Component({
  selector: 'app-multi-leg-eod',
  standalone: true,
  imports: [DataTableComponent, ChartTooltipComponent],
  templateUrl: './multi-leg-eod.component.html',
  styleUrl: './multi-leg-eod.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MultiLegEodComponent implements OnInit {
  private readonly eod = inject(EodService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly ranges: readonly RangePreset[] = ['1W', '1M', '3M', 'Custom'];
  readonly pageSizes = PAGE_SIZES;
  readonly maxLegs = MAX_LEGS;
  readonly today = todayUtc();
  readonly legLabel = legLabel;
  readonly longDate = longDate;

  /* ---------- symbol ---------- */
  readonly symbols = signal<string[]>([]);
  readonly symbolsLoading = signal(true);
  readonly symbol = signal(DefaultStock);
  readonly symbolQuery = signal(DefaultStock);
  readonly suggestionsOpen = signal(false);
  readonly highlightedIndex = signal(-1);
  readonly filteredSymbols = computed(() => {
    const query = this.symbolQuery().trim().toLowerCase();
    return query ? this.symbols().filter(s => s.toLowerCase().includes(query)) : this.symbols();
  });

  /* ---------- instrument metadata ---------- */
  readonly strikes = signal<number[]>([]);
  readonly atmStrike = signal<number | null>(null);
  readonly expiries = signal<string[]>([]);
  readonly underlying = signal<number | null>(null);
  readonly tradeDate = signal('');
  /** Most common spacing between listed strikes, as the reference's "strikes in steps of N" note. */
  readonly strikeStep = computed(() => {
    const strikes = this.strikes(), spot = this.underlying();
    return strikes.length > 1 && spot ? deriveStrikeStep(strikes, spot) : 0;
  });
  readonly metaLoading = signal(false);
  readonly metaError = signal('');

  /* ---------- legs + range ---------- */
  readonly legs = signal<LegSelection[]>([]);
  readonly range = signal<RangePreset>('3M');
  readonly customFrom = signal('');
  readonly customTill = signal('');
  readonly rangeResolution = computed(() => resolveRange(this.range(), this.today, this.customFrom(), this.customTill()));
  readonly rangeError = computed(() => {
    const resolved = this.rangeResolution();
    return 'error' in resolved ? resolved.error : '';
  });
  /** Picker limits (see shared/utils/date-range.ts): a chosen date is never blocked by the other; an empty one is narrowed to the valid window. */
  readonly fromBounds = computed(() => fromPickerBounds(this.customFrom(), this.customTill(), this.today));
  readonly tillBounds = computed(() => tillPickerBounds(this.customFrom(), this.customTill(), this.today));
  /** Why a date was just cleared; shown in place of the generic "select both dates" message. */
  readonly clearedNote = signal('');

  /* ---------- data ---------- */
  readonly series = signal<LegSeries[]>([]);
  readonly loading = signal(false);
  readonly loadError = signal('');

  /* ---------- table + chart state ---------- */
  readonly tableLeg = signal<'all' | number>('all');
  readonly rowsPerPage = signal<number>(10);
  readonly page = signal(0);
  readonly narrow = signal(typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(NARROW_QUERY).matches);
  readonly hover = signal<{ index: number; left: number; top: number } | null>(null);

  readonly sessions = computed(() => {
    const resolved = this.rangeResolution();
    const all = buildSessions(this.series(), 'range' in resolved ? resolved.range : undefined);
    const preset = this.range();
    // 1W / 1M / 3M show the last 5 / 21 / 63 sessions; Custom shows every session in the chosen dates.
    return preset === 'Custom' ? all : all.slice(-PRESET_SESSIONS[preset]);
  });
  readonly chart = computed(() => buildLegChart(this.sessions(), this.series(), this.narrow()));
  readonly activeLegIndex = computed(() => {
    const selected = this.tableLeg();
    return selected === 'all' ? -1 : this.series().findIndex(s => s.leg.id === selected);
  });
  readonly combined = computed(() => combinedRows(this.sessions(), this.series().length));
  readonly single = computed(() => (this.activeLegIndex() >= 0 ? singleLegRows(this.sessions(), this.activeLegIndex()) : []));
  readonly totalSessions = computed(() => this.sessions().length);
  private readonly combinedPaged = computed(() => pageSlice(this.combined(), this.page(), this.rowsPerPage()));
  private readonly singlePaged = computed(() => pageSlice(this.single(), this.page(), this.rowsPerPage()));
  readonly pageInfo = computed(() => {
    const paged = this.activeLegIndex() >= 0 ? this.singlePaged() : this.combinedPaged();
    return { page: paged.page, pages: paged.pages, shown: paged.slice.length };
  });
  readonly combinedPage = computed(() => (this.activeLegIndex() >= 0 ? [] : this.combinedPaged().slice));
  readonly singlePage = computed(() => (this.activeLegIndex() >= 0 ? this.singlePaged().slice : []));
  readonly tableInfo = computed(() => {
    const total = this.totalSessions();
    return total ? `Showing ${this.pageInfo().shown} of ${total} sessions, latest first` : 'No sessions to show';
  });
  readonly canDownload = computed(() => this.sessions().length > 0 && this.series().some(s => s.rows.length > 0));
  readonly missingLegs = computed(() => this.series().filter(s => s.status === 'ready' && s.rows.length === 0));
  readonly missingLegsLabel = computed(() => this.missingLegs().map(s => s.label).join(', '));
  readonly failedLegs = computed(() => this.series().filter(s => s.status === 'error'));

  readonly combinedColumns = computed<DataTableColumn<CombinedTableRow>[]>(() => [
    { key: 'date', label: 'Date' },
    ...this.series().map((s, i) => ({
      key: `leg${s.leg.id}`,
      label: s.label,
      type: 'change' as const,
      align: 'right' as const,
      value: (row: CombinedTableRow) => row.changes[i] ?? 0,
      formatter: (_value: unknown, row: CombinedTableRow) => (row.closes[i] === null ? '—' : PRICE.format(row.closes[i] as number)),
    })),
  ]);
  readonly singleColumns: DataTableColumn<SingleLegTableRow>[] = [
    { key: 'date', label: 'Date' },
    { key: 'open', label: 'Open', align: 'right', formatter: (_v, row) => (row.bar ? this.price(row.bar.open) : 'not listed / expired') },
    { key: 'high', label: 'High', align: 'right', formatter: (_v, row) => this.price(row.bar?.high) },
    { key: 'low', label: 'Low', align: 'right', formatter: (_v, row) => this.price(row.bar?.low) },
    {
      key: 'close', label: CLOSE_EOD_LABEL, type: 'change', align: 'right',
      value: row => row.change ?? 0,
      formatter: (_v, row) => this.price(row.bar?.close),
    },
    { key: 'volume', label: 'Volume', align: 'right', formatter: (_v, row) => this.thousands(row.bar?.volume) },
    { key: 'oi', label: 'OI', align: 'right', formatter: (_v, row) => this.thousands(row.bar?.oi) },
  ];

  readonly tooltipTitle = computed(() => {
    const hover = this.hover();
    const session = hover ? this.sessions()[hover.index] : undefined;
    return session ? longDate(session.date) : '';
  });
  readonly tooltipRows = computed<ChartTooltipRow[]>(() => {
    const hover = this.hover();
    const session = hover ? this.sessions()[hover.index] : undefined;
    if (!session) return [];
    return this.series().map((s, i) => {
      const bar = session.bars[i];
      return { label: s.label, value: bar && Number.isFinite(bar.close) ? PRICE.format(bar.close) : '—', tone: 'neutral' as const };
    });
  });

  private legId = 0;
  /** Loaded legs, by contract + date range. Only legs missing from here are requested. */
  private readonly cache = new Map<string, EodDataRow[]>();
  /** Requests still running, so a leg changed or re-requested mid-flight is never fetched twice. */
  private readonly inflight = new Map<string, Observable<EodDataRow[]>>();
  private readonly metaRequest$ = new Subject<string>();
  private readonly dataRequest$ = new Subject<{ symbol: string; legs: LegSelection[]; range: DateRange }>();

  ngOnInit(): void {
    this.watchViewport();
    this.setupPipelines();
    this.eod.getSymbols().pipe(
      catchError(() => {
        this.toast.error('Unable to load symbols. Please refresh and try again.');
        return of([] as string[]);
      }),
      finalize(() => this.symbolsLoading.set(false)),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(symbols => this.symbols.set(symbols));
    this.metaRequest$.next(this.symbol());
  }

  /* ================= symbol ================= */

  onSymbolInput(value: string): void {
    this.symbolQuery.set(value);
    this.suggestionsOpen.set(true);
    this.highlightedIndex.set(-1);
  }

  openSuggestions(): void {
    this.suggestionsOpen.set(true);
  }

  clearSymbol(): void {
    this.symbolQuery.set('');
    this.suggestionsOpen.set(true);
    this.highlightedIndex.set(-1);
  }

  selectSymbol(symbol: string): void {
    if (!this.symbols().includes(symbol)) return;
    this.symbolQuery.set(symbol);
    this.suggestionsOpen.set(false);
    this.highlightedIndex.set(-1);
    if (symbol === this.symbol()) return;
    this.symbol.set(symbol);
    this.metaRequest$.next(symbol);
  }

  onSymbolKeydown(event: KeyboardEvent): void {
    const options = this.filteredSymbols();
    if (!this.suggestionsOpen() || !options.length) {
      if (event.key === 'ArrowDown') this.openSuggestions();
      return;
    }
    const current = this.highlightedIndex();
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.highlightedIndex.set((current + 1) % options.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.highlightedIndex.set(current <= 0 ? options.length - 1 : current - 1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      this.selectSymbol(options[Math.max(0, current)]);
    } else if (event.key === 'Escape') {
      this.suggestionsOpen.set(false);
    }
  }

  onSymbolBlur(): void {
    window.setTimeout(() => {
      this.suggestionsOpen.set(false);
      // Text that is not a listed symbol reverts to the active selection.
      if (this.symbolQuery() !== this.symbol()) this.symbolQuery.set(this.symbol());
    }, 150);
  }

  /* ================= date range ================= */

  setRange(range: RangePreset): void {
    this.range.set(range);
    this.clearedNote.set('');
    if (range === 'Custom' && !this.customFrom()) {
      const till = this.today;
      const from = new Date(Date.parse(`${till}T00:00:00Z`) - 30 * 86400000);
      this.customTill.set(till);
      this.customFrom.set(ymd(from));
    }
    this.page.set(0);
    this.reload();
  }

  /** A new From date is never refused; a To date that no longer fits it (earlier, or over a year later) is cleared to be picked again. */
  onCustomFrom(value: string): void {
    this.customFrom.set(value);
    this.clearedNote.set('');
    const conflict = tillConflict(value, this.customTill());
    if (conflict) {
      this.customTill.set('');
      this.clearedNote.set(clearedMessage('To', conflict));
    }
    this.page.set(0);
    this.reload();
  }

  /** Mirror of onCustomFrom: a From date that no longer fits the new To date is cleared. */
  onCustomTill(value: string): void {
    this.customTill.set(value);
    this.clearedNote.set('');
    const conflict = fromConflict(this.customFrom(), value);
    if (conflict) {
      this.customFrom.set('');
      this.clearedNote.set(clearedMessage('From', conflict));
    }
    this.page.set(0);
    this.reload();
  }

  /* ================= legs ================= */

  addLeg(): void {
    if (this.legs().length >= MAX_LEGS || !this.expiries().length) return;
    const last = this.legs()[this.legs().length - 1];
    this.legs.update(list => [...list, this.newLeg('CE', this.defaultStrike(), last?.expiry ?? this.expiries()[0])]);
    this.afterLegChange();
  }

  removeLeg(id: number): void {
    this.legs.update(list => list.filter(leg => leg.id !== id));
    if (this.tableLeg() === id) this.tableLeg.set('all');
    this.afterLegChange();
  }

  setLegType(id: number, type: LegOptionType): void {
    this.patchLeg(id, { optionType: type });
  }

  setLegStrike(id: number, raw: string): void {
    const strike = Number(raw);
    this.patchLeg(id, { strike: Number.isFinite(strike) ? strike : null });
  }

  setLegExpiry(id: number, expiry: string): void {
    this.patchLeg(id, { expiry });
  }

  legColorClass(index: number): string {
    return `leg-c${index % 6}`;
  }

  /* ================= table ================= */

  selectTableLeg(value: 'all' | number): void {
    this.tableLeg.set(value);
    this.page.set(0);
  }

  onRowsPerPage(value: string): void {
    const size = Number(value);
    if (!this.pageSizes.includes(size as (typeof PAGE_SIZES)[number])) return;
    this.rowsPerPage.set(size);
    this.page.set(0);
  }

  previousPage(): void {
    if (this.page() > 0) this.page.update(p => p - 1);
  }

  nextPage(): void {
    if (this.pageInfo().page < this.pageInfo().pages - 1) this.page.update(p => p + 1);
  }

  /* ================= chart hover ================= */

  onChartPointer(event: MouseEvent | TouchEvent): void {
    const chart = this.chart();
    const svg = (event.currentTarget as SVGGraphicsElement | null)?.ownerSVGElement;
    const wrap = svg?.parentElement;
    if (!chart || !svg || !wrap) return;
    const clientX = 'touches' in event ? event.touches[0]?.clientX : event.clientX;
    if (clientX == null) return;
    const bounds = svg.getBoundingClientRect();
    if (!bounds.width) return;
    const svgX = ((clientX - bounds.left) / bounds.width) * chart.width;
    const count = chart.xs.length;
    const ratio = Math.max(0, Math.min(1, (svgX - chart.padLeft) / chart.plotWidth));
    const index = Math.max(0, Math.min(count - 1, Math.round(ratio * (count - 1))));
    const container = wrap.getBoundingClientRect();
    this.hover.set({
      index,
      left: Math.max(4, Math.min(container.width - 190, (chart.xs[index] / chart.width) * bounds.width + 12)),
      top: 8,
    });
  }

  hideChartTooltip(): void {
    this.hover.set(null);
  }

  /* ================= CSV ================= */

  downloadCsv(): void {
    const sessions = this.sessions();
    if (!sessions.length) {
      this.toast.error('There is no EOD data available to download.');
      return;
    }
    const index = this.activeLegIndex();
    const series = this.series();
    try {
      const text = index >= 0 ? singleLegCsv(sessions, index) : combinedCsv(sessions, series);
      const name = csvFilename(this.symbol(), index >= 0 ? [series[index].leg] : series.map(s => s.leg));
      const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 500);
      this.toast.success(`${name} exported.`);
    } catch {
      this.toast.error('Unable to download the CSV. Please try again.');
    }
  }

  /* ================= internals ================= */

  private price(value: number | null | undefined): string {
    return value === null || value === undefined || !Number.isFinite(value) ? '—' : PRICE.format(value);
  }

  private thousands(value: number | null | undefined): string {
    return value === null || value === undefined || !Number.isFinite(value) ? '—' : `${KILO.format(value / 1000)}K`;
  }

  private newLeg(optionType: LegOptionType, strike: number | null, expiry: string): LegSelection {
    return { id: ++this.legId, optionType, strike, expiry };
  }

  private defaultStrike(): number | null {
    const strikes = this.strikes(), atm = this.atmStrike();
    return atm !== null && strikes.includes(atm) ? atm : (strikes[Math.floor(strikes.length / 2)] ?? null);
  }

  private patchLeg(id: number, patch: Partial<LegSelection>): void {
    this.legs.update(list => list.map(leg => (leg.id === id ? { ...leg, ...patch } : leg)));
    this.afterLegChange();
  }

  private afterLegChange(): void {
    this.page.set(0);
    this.reload();
  }

  /** Requests every complete leg for the resolved range; switchMap drops responses to superseded selections. */
  private reload(): void {
    const resolved = this.rangeResolution();
    const legs = this.legs();
    this.hover.set(null);
    // Show the chosen legs immediately; their bars arrive from the API.
    this.series.set(legs.map(leg => ({ leg, label: legLabel(leg), status: 'loading' as const, rows: [] })));
    if (!('range' in resolved) || !legs.some(isLegComplete)) {
      this.loading.set(false);
      this.series.set(legs.map(leg => ({ leg, label: legLabel(leg), status: 'ready' as const, rows: [] })));
      return;
    }
    this.dataRequest$.next({ symbol: this.symbol(), legs, range: resolved.range });
  }

  private setupPipelines(): void {
    this.metaRequest$.pipe(
      tap(() => {
        this.metaLoading.set(true);
        this.metaError.set('');
        this.loadError.set('');
        this.strikes.set([]);
        this.atmStrike.set(null);
        this.expiries.set([]);
        this.underlying.set(null);
        this.tradeDate.set('');
        this.legs.set([]);
        this.series.set([]);
        this.tableLeg.set('all');
        this.cache.clear();
        this.inflight.clear();
      }),
      switchMap(symbol => (symbol ? this.eod.getDdGreeks({ symbol }).pipe(
        map(response => response.data),
        catchError(() => {
          this.metaError.set(`Unable to load strikes and expiries for ${symbol}. Please try again.`);
          this.toast.error(this.metaError());
          return of(null);
        }),
      ) : of(null))),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(data => {
      this.metaLoading.set(false);
      if (!data) return;
      const rawExpiries = Array.isArray(data.expiry_date) ? data.expiry_date : [data.expiry_date];
      const expiries = [...new Set(rawExpiries.map(value => String(value).slice(0, 10)).filter(v => /^\d{4}-\d{2}-\d{2}$/.test(v)))].sort();
      this.strikes.set([...(data.strike ?? [])].filter(Number.isFinite).sort((a, b) => a - b));
      this.atmStrike.set(Number.isFinite(data.atm_strike) ? data.atm_strike : null);
      this.expiries.set(expiries);
      this.underlying.set(Number.isFinite(data.underlying) ? data.underlying : null);
      this.tradeDate.set(typeof data.trade_date === 'string' ? data.trade_date.slice(0, 10) : '');
      if (!expiries.length || !this.strikes().length) {
        this.metaError.set(`No listed strikes or expiries are available for ${this.symbol()}.`);
        return;
      }
      const strike = this.defaultStrike(), expiry = expiries[0];
      this.legs.set([this.newLeg('CE', strike, expiry), this.newLeg('PE', strike, expiry)]);
      this.reload();
    });

    this.dataRequest$.pipe(
      tap(() => {
        this.loading.set(true);
        this.loadError.set('');
      }),
      switchMap(({ symbol, legs, range }) => forkJoin(legs.map(leg => this.loadLeg(symbol, leg, range))).pipe(
        map(results => ({ symbol, results })),
      )),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(({ symbol, results }) => {
      this.loading.set(false);
      if (symbol !== this.symbol()) return;
      this.series.set(results);
      const failed = results.filter(r => r.status === 'error');
      if (failed.length) {
        this.loadError.set(`Unable to load EOD data for ${failed.map(f => f.label).join(', ')}.`);
        this.toast.error(this.loadError());
      }
    });
  }

  /**
   * One leg: from the cache when already loaded, otherwise one request (getAllRows follows the API's 500-row pages).
   * The request is shared and keeps running if the selection changes while it is in flight, so its result still
   * lands in the cache; switchMap on the screen only drops the stale *result*, never causes a repeat request.
   */
  private loadLeg(symbol: string, leg: LegSelection, range: DateRange) {
    const base = { leg, label: legLabel(leg) };
    if (!isLegComplete(leg)) return of<LegSeries>({ ...base, status: 'ready', rows: [] });
    return this.legRows(symbol, leg, range).pipe(
      map((rows): LegSeries => ({ ...base, status: 'ready', rows })),
      catchError(() => of<LegSeries>({ ...base, status: 'error', rows: [] })),
    );
  }

  private legRows(symbol: string, leg: LegSelection, range: DateRange): Observable<EodDataRow[]> {
    const key = legCacheKey(symbol, leg, range);
    const cached = this.cache.get(key);
    if (cached) return of(cached);
    const pending = this.inflight.get(key);
    if (pending) return pending;
    const request$ = this.eod.getAllRows({
      symbol, option_type: leg.optionType, strike: leg.strike as number, expiry: leg.expiry, date_from: range.from, date_till: range.till,
    }).pipe(
      // Sessions without trades (zero prices and volume) stay gaps; see isNoTradeBar.
      map(rows => rows.filter(row => !isNoTradeBar(row))),
      tap(rows => { if (symbol === this.symbol()) this.cache.set(key, rows); }),
      finalize(() => this.inflight.delete(key)),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    this.inflight.set(key, request$);
    return request$;
  }

  private watchViewport(): void {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(NARROW_QUERY);
    const listener = (event: MediaQueryListEvent) => this.narrow.set(event.matches);
    query.addEventListener('change', listener);
    this.destroyRef.onDestroy(() => query.removeEventListener('change', listener));
  }
}
