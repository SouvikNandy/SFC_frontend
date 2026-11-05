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
import { nearestStrike } from '../../../shared/utils/atm-strike';
import { cleanDates, isNoExpiriesResponse } from '../../../shared/utils/expiry-selection';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, Subject, catchError, finalize, forkJoin, map, mergeMap, of, shareReplay, switchMap, tap } from 'rxjs';
import { ToastService } from '../../../core/services/toast.service';
import { ChartTooltipComponent, ChartTooltipRow } from '../../../shared/components/chart-tooltip/chart-tooltip.component';
import { DataTableComponent } from '../../../shared/components/data-table/data-table.component';
import { DataTableColumn } from '../../../shared/components/data-table/data-table.types';
import { DefaultStock } from '../../../shared/services/constantFile';
import { clearedMessage, fromConflict, fromPickerBounds, tillConflict, tillPickerBounds } from '../../../shared/utils/date-range';
import { EodDataRow } from '../eod/eod.model';
import { EodService } from '../eod/eod.service';
import { ExpiryStrikesService } from '../eod/expiry-strikes.service';
import { HistoricalUnderlyingService, UNDERLYING_UNAVAILABLE_MESSAGE } from '../eod/historical-underlying.service';
import { isNoTradeBar } from '../eod/eod-rows.util';
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
  isSparseAtm,
  legCacheKey,
  PRESET_SESSIONS,
  legLabel,
  longDate,
  pageSlice,
  reconcileLegExpiry,
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

const expiryKey = (request: { symbol: string; from: string; till: string }): string => `${request.symbol}|${request.from}|${request.till}`;

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
  private readonly historicalUnderlying = inject(HistoricalUnderlyingService);
  private readonly expiryStrikesService = inject(ExpiryStrikesService);
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
  /** Strikes listed for each expiry (`dd_strikes`) of the current symbol, by expiry date. A leg takes its strike list from its own expiry. */
  readonly expiryStrikes = signal<Record<string, number[]>>({});
  /** Expiries whose strikes are missing or could not be loaded, and why. */
  private readonly strikeIssues = signal<Record<string, 'none' | 'unavailable'>>({});
  /** Expiries whose strikes have been requested and not answered yet. */
  private readonly strikesPending = signal<string[]>([]);
  readonly strikesLoading = computed(() => this.strikesPending().length > 0);
  /** Leg expiries whose strike list could not be loaded: a failure, shown as an error with Retry. */
  readonly strikeIssueErrors = computed(() => this.legExpiriesWithIssue('unavailable').map(expiry => `Unable to load the strikes for the ${this.longDate(expiry)} expiry.`));
  /** Leg expiries that list no strikes: a data condition, shown as a neutral note. */
  readonly strikeIssueNotes = computed(() => this.legExpiriesWithIssue('none').map(expiry => `No strikes are listed for the ${this.longDate(expiry)} expiry.`));
  /** Expiries from `dd_symbol_details`: only the starting point (and the fallback) until the range's own list has loaded. */
  private readonly metaExpiries = signal<string[]>([]);
  /** Expiries from `dd_expiry` for the resolved range of any mode (only those between From and To, in the order returned); null when not loaded. */
  private readonly rangeExpiries = signal<string[] | null>(null);
  /** Expiries `dd_expiry` also lists after the To date (it returns every expiry alive in the window, including later ones). Empty until the range answers. */
  private readonly laterExpiries = signal<string[]>([]);
  readonly expiryError = signal('');
  /** True from the moment an expiry request is sent until its answer (or a newer decision) arrives. */
  readonly expiryLoading = signal(false);
  /** The historical ATM (underlying close on To, or the previous session) is being fetched. */
  readonly atmLoading = signal(false);
  /** The closing price for the selected To date could not be loaded: a failure (error, Retry). Empty otherwise. */
  readonly atmError = signal('');
  /** No trading session exists on or before the To date: a data condition (neutral note); strikes are chosen by hand. */
  readonly atmNote = signal('');
  /** The closing price is not in the backend's history for the To date: information (no error, no toast); strikes are chosen by hand. */
  readonly atmInfo = signal('');
  /** The range itself has no historical expiries (the dropdown then holds only upcoming ones); the legs keep their selections. */
  readonly expiriesEmpty = computed(() => this.rangeExpiries()?.length === 0);
  /**
   * Shown when no expiry falls inside the selected dates. The second sentence says what the untouched legs were given, so it only appears while
   * some leg still follows the default; when every leg was chosen by hand nothing was selected for them. With no expiry on or after To the
   * forward-expiry message explains the situation instead, so this one stays hidden.
   */
  readonly emptyRangeMessage = computed(() => {
    if (!this.expiriesEmpty() || this.noExpiryMessage()) return '';
    const base = 'No expiry falls within the selected date range.';
    return this.legs().some(leg => !leg.picked?.expiry)
      ? `${base} The nearest available expiry on or after the To date is selected for the option legs.`
      : base;
  });
  /** Listed expiries that have not passed (today's included), from `dd_symbol_details`. */
  readonly upcomingExpiries = computed(() => this.metaExpiries().filter(expiry => expiry >= this.today));
  /**
   * The dropdown: the range's historical expiries plus those listed after To and the upcoming ones, de-duplicated, earliest first, never one
   * before From. Until the range answers (or when it fails) it is the standard list, which is never offered for selection (see expiryListReady).
   */
  readonly expiries = computed(() => {
    const historical = this.rangeExpiries();
    if (historical === null) return this.metaExpiries();
    const resolved = this.rangeResolution();
    const from = 'range' in resolved ? resolved.range.from : '';
    return [...new Set([...historical, ...this.laterExpiries(), ...this.upcomingExpiries()])].filter(expiry => expiry >= from).sort();
  });
  /**
   * The expiry list belongs to the current, valid dates: `dd_expiry` answered for them. Only then can an expiry be chosen and leg data be
   * requested; while it loads, after it failed or while the Custom dates are invalid the selections are kept and the dropdowns are disabled.
   */
  readonly expiryListReady = computed(() => 'range' in this.rangeResolution() && this.rangeExpiries() !== null && !this.expiryLoading());
  /** No expiry on or after the From date exists for these dates: the legs have none and nothing is requested. */
  readonly noExpiryMessage = computed(() => {
    const resolved = this.rangeResolution();
    if (!this.expiryListReady() || !('range' in resolved) || this.expiries().length) return '';
    return `No expiry is available on or after the From date (${this.longDate(resolved.range.from)}). Choose a different date range.`;
  });
  /** A leg can be added: the list is verified and holds at least one valid expiry. */
  readonly canAddLeg = computed(() => this.expiryListReady() && this.expiries().length > 0);
  readonly underlying = signal<number | null>(null);
  readonly tradeDate = signal('');
  readonly metaLoading = signal(false);
  /** Strikes and expiries of the symbol could not be loaded: a failure (error, Retry). */
  readonly metaError = signal('');
  /** The symbol lists no strikes or expiries: a data condition (neutral note). */
  readonly metaNote = signal('');
  /** The symbol list could not be loaded: a failure that leaves nothing to choose from (error, Retry). */
  readonly symbolsError = signal('');

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
  /**
   * The dates are valid but their expiry list is not verified (its request failed): no leg data was requested, so the chart and table must
   * not say that the backend returned nothing. While the list loads, the normal loading state applies instead.
   */
  readonly legDataPending = computed(() => 'range' in this.rangeResolution() && !!this.symbol() && this.rangeExpiries() === null && !this.expiryLoading());
  readonly legDataPendingMessage = 'Leg data loads once the expiry list for these dates is available.';
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
  private readonly expiryRequest$ = new Subject<{ symbol: string; from: string; till: string } | null>();
  /** Key of the expiry request currently wanted; a response for any other key is stale. */
  private wantedExpiryKey = '';
  /** The first load after a symbol change waits for the range's expiries, the historical ATM and the legs' strikes, so the default legs are requested once, complete. */
  private readonly initPending = new Set<'expiry' | 'atm' | 'strikes'>();
  /** A date change is waiting for its expiry list, closing price and strike lists; the legs are requested once, when all have answered (flushHeld). */
  private held = false;
  /** True while a date change is starting its requests, so answers that arrive at once do not send the held reload before the others were started. */
  private syncing = false;
  private readonly strikesRequest$ = new Subject<{ symbol: string; expiry: string }>();
  private readonly atmRequest$ = new Subject<{ symbol: string; till: string } | null>();
  /** Symbol and To date the ATM currently wanted was asked for; an answer for any other key is stale. */
  private wantedAtmKey = '';
  private readonly dataRequest$ = new Subject<{ symbol: string; legs: LegSelection[]; range: DateRange } | null>();

  ngOnInit(): void {
    this.watchViewport();
    this.setupPipelines();
    this.loadSymbols();
    this.metaRequest$.next(this.symbol());
  }

  /** The symbol list; a failure stays on screen as an error with Retry (no toast: the error is already visible). */
  loadSymbols(): void {
    this.symbolsLoading.set(true);
    this.symbolsError.set('');
    this.eod.getSymbols().pipe(
      catchError(() => {
        this.symbolsError.set('Unable to load the symbol list.');
        return of([] as string[]);
      }),
      finalize(() => this.symbolsLoading.set(false)),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(symbols => this.symbols.set(symbols));
  }

  /** Asks again for the strikes and expiries of the current symbol after a failure. */
  retryMeta(): void {
    this.metaRequest$.next(this.symbol());
  }

  /** Asks again for the closing price of the To date after a failure; the legs reload once it answers. */
  retryAtm(): void {
    this.wantedAtmKey = '';
    this.syncRangeExpiriesThenReload();
  }

  /** Requests the legs again after a load failure (loaded legs come from the cache). */
  retryLegs(): void {
    this.loadError.set('');
    this.reload();
  }

  /** Asks again for every leg expiry without a strike list (failures are not remembered, see ensureStrikes). */
  retryStrikes(): void {
    this.ensureStrikes();
  }

  private legExpiriesWithIssue(reason: 'none' | 'unavailable'): string[] {
    const issues = this.strikeIssues();
    return [...new Set(this.legs().map(leg => leg.expiry))].filter(expiry => issues[expiry] === reason);
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
    this.syncRangeExpiriesThenReload();
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
    this.syncRangeExpiriesThenReload();
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
    this.syncRangeExpiriesThenReload();
  }

  /* ================= legs ================= */

  addLeg(): void {
    const resolved = this.rangeResolution();
    if (this.legs().length >= MAX_LEGS || !this.canAddLeg() || !('range' in resolved)) return;
    const last = this.legs()[this.legs().length - 1];
    // The last leg's expiry is listed (the legs are reconciled with every verified list); without one, the default for these dates.
    const expiry = last?.expiry || reconcileLegExpiry('', false, this.expiries(), resolved.range);
    if (!expiry) return;
    const leg = this.newLeg('CE', this.atmFor(expiry), expiry);
    // An expiry copied from a leg the user set by hand is the user's choice too: it must not be moved by a later default.
    if (last?.picked?.expiry) leg.picked = { expiry: true };
    this.legs.update(list => [...list, leg]);
    this.ensureStrikes();
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
      this.toast.info('There is no EOD data to download for these dates.');   // nothing failed: there is simply no data
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

  /** The listed strikes of an expiry; empty until `dd_strikes` has answered for it. */
  strikesFor(expiry: string): number[] {
    return this.expiryStrikes()[expiry] ?? [];
  }

  /** A leg's strike list is being refreshed (the closing price or its expiry's strikes): spinner and disabled. */
  strikeBusy(expiry: string): boolean {
    return this.atmLoading() || this.strikesLoadingFor(expiry);
  }

  strikesLoadingFor(expiry: string): boolean {
    return this.strikesPending().includes(expiry);
  }

  /** The ATM for an expiry: the strike listed for it that is nearest the underlying close of the To date. Null while either is unknown. */
  atmFor(expiry: string): number | null {
    if (this.atmLoading()) return null;   // the close held meanwhile belongs to the previous To date
    return nearestStrike(this.strikesFor(expiry), this.underlying());
  }

  /** The leg's calculated ATM is far from the underlying close because its expiry lists few strikes near the money. Independent of the strike chosen. */
  sparseAtm(expiry: string): boolean {
    return isSparseAtm(this.atmFor(expiry), this.underlying());
  }

  /** Suffix for a strike the user kept that the expiry does not list (or whose list could not be checked). */
  strikeFlag(leg: LegSelection): string {
    // A strike the expiry is known not to list is reset to the ATM (applyDefaultStrikes), so only an unverifiable one is ever flagged.
    if (leg.strike === null || this.strikesLoadingFor(leg.expiry)) return '';
    return this.strikeIssues()[leg.expiry] === 'unavailable' ? ' (could not be checked for this expiry)' : '';
  }

  /** No ATM is known: drop the underlying and session so nothing implies one. */
  private clearAtm(): void {
    this.underlying.set(null);
    this.tradeDate.set('');
  }

  /**
   * Untouched strikes follow their expiry's ATM (none while it is unknown). A strike the user picked is kept while its expiry lists it; once the
   * expiry's list is known and does not contain it (or the expiry lists no strikes) it is reset to that expiry's ATM and is no longer a pick.
   * A list that could not be loaded proves nothing, so a pick is kept then. True when a leg changed.
   */
  private applyDefaultStrikes(): boolean {
    // While the closing price of a new To date loads, the one held is the previous date's: no strike is derived from it.
    if (this.atmLoading()) return false;
    const before = this.legs();
    const after = before.map(leg => {
      if (leg.picked?.strike && !this.isStrikeUnlisted(leg)) return leg;
      if (leg.picked?.strike) {
        // The user's own strike is replaced, so they are told (an automatic change to an untouched strike stays silent).
        const { picked, ...rest } = leg;
        const atm = this.atmFor(leg.expiry);
        this.toast.info(atm === null
          ? `Strike ${leg.strike} is not listed for the ${this.longDate(leg.expiry)} expiry. Select a strike.`
          : `Strike ${leg.strike} is not listed for the ${this.longDate(leg.expiry)} expiry, so the ATM strike ${atm} is selected.`);
        return { ...rest, strike: atm, ...(picked?.expiry ? { picked: { expiry: true } } : {}) };
      }
      const atm = this.atmFor(leg.expiry);
      return leg.strike === atm ? leg : { ...leg, strike: atm };
    });
    const changed = after.some((leg, index) => leg !== before[index]);
    if (changed) this.legs.set(after);
    return changed;
  }

  /** The leg's strike is known not to exist for its expiry: the expiry's list is loaded without it, or the expiry lists no strikes. */
  isStrikeUnlisted(leg: LegSelection): boolean {
    if (leg.strike === null || this.strikesLoadingFor(leg.expiry)) return false;
    if (leg.expiry in this.expiryStrikes()) return !this.strikesFor(leg.expiry).includes(leg.strike);
    return this.strikeIssues()[leg.expiry] === 'none';
  }

  /** Asks `dd_strikes` for every leg expiry that has no list yet, once each. The legs' expiries are final only after the range's expiries answered. */
  private ensureStrikes(): void {
    if (!this.initPending.has('expiry')) {
      const symbol = this.symbol();
      for (const expiry of new Set(this.legs().map(leg => leg.expiry))) {
        if (!expiry || expiry in this.expiryStrikes() || this.strikesLoadingFor(expiry)) continue;
        this.strikesPending.update(list => [...list, expiry]);
        this.strikeIssues.update(({ [expiry]: _dropped, ...rest }) => rest);
        this.strikesRequest$.next({ symbol, expiry });
      }
    }
    this.settleStrikesInit(false);
  }

  /** Every leg expiry has a strike list or a reason for none. */
  private legStrikesSettled(): boolean {
    // A leg cleared for lack of a valid expiry has no strikes to wait for.
    return this.legs().every(leg => !leg.expiry || leg.expiry in this.expiryStrikes() || leg.expiry in this.strikeIssues());
  }

  private settleStrikesInit(changed: boolean): void {
    if (!this.initPending.has('strikes') || this.initPending.has('expiry') || !this.legStrikesSettled()) return;
    this.settleInit('strikes', changed || this.applyDefaultStrikes());
  }

  private patchLeg(id: number, patch: Partial<LegSelection>): void {
    // A strike or expiry chosen here is the user's: later defaults (ATM, latest expiry) leave it alone.
    const picked = { ...('strike' in patch ? { strike: true } : {}), ...('expiry' in patch ? { expiry: true } : {}) };
    this.legs.update(list => list.map(leg => (leg.id === id ? { ...leg, ...patch, picked: { ...leg.picked, ...picked } } : leg)));
    if ('expiry' in patch) {
      // A new expiry has its own strikes: an untouched strike moves to that expiry's ATM (none until its list has loaded).
      this.applyDefaultStrikes();
      this.ensureStrikes();
    }
    this.afterLegChange();
  }

  private afterLegChange(): void {
    this.page.set(0);
    this.reload();
  }

  /**
   * A leg is requested only when complete, not expired before the range starts (no data; the backend refuses it with HTTP 422), and once its
   * strike is settled for its expiry: not while that expiry's strikes load, and never with a strike the expiry is known not to list.
   */
  private isRequestable(leg: LegSelection, range: DateRange): boolean {
    return isLegComplete(leg) && leg.expiry >= range.from && !this.strikesLoadingFor(leg.expiry) && !this.isStrikeUnlisted(leg);
  }

  /** Requests every complete leg for the resolved range; switchMap drops responses to superseded selections. */
  private reload(): void {
    const resolved = this.rangeResolution();
    const legs = this.legs();
    this.hover.set(null);
    // Show the chosen legs immediately; their bars arrive from the API.
    this.series.set(legs.map(leg => ({ leg, label: legLabel(leg), status: 'loading' as const, rows: [] })));
    // Without a verified expiry list for these dates (it failed, or the dates are invalid) nothing is requested: an expiry is never unverified.
    if (!('range' in resolved) || this.rangeExpiries() === null || !legs.some(leg => this.isRequestable(leg, resolved.range))) {
      this.loading.set(false);
      this.series.set(legs.map(leg => ({ leg, label: legLabel(leg), status: 'ready' as const, rows: [] })));
      return;
    }
    this.dataRequest$.next({ symbol: this.symbol(), legs, range: resolved.range });
  }

  /**
   * A date change: ask for the new expiry list and the ATM, then reload. While a new expiry list is requested the legs still carry the
   * expiries of the previous dates, so the reload waits for the list's answer (see the expiry handler) instead of requesting them.
   */
  private syncRangeExpiriesThenReload(): void {
    this.held = true;
    this.syncing = true;
    try {
      this.syncRangeExpiries();
      this.syncHistoricalAtm();
      this.ensureStrikes();
    } finally {
      this.syncing = false;
    }
    this.flushHeld();
  }

  /** The new dates' inputs are still loading: the expiry list, the closing price, or a strike list one of the legs needs. */
  private inputsPending(): boolean {
    return this.expiryLoading() || this.atmLoading() || this.legs().some(leg => this.strikesLoadingFor(leg.expiry));
  }

  /**
   * Sends the held reload once the expiry list, the historical closing price and the strike lists are all in, so a leg is only ever requested
   * with the expiry and strike that belong to the new dates. While anything is outstanding the legs show as loading and nothing is requested.
   */
  private flushHeld(): void {
    if (!this.held || this.syncing || this.initPending.size > 0) return;
    if (this.inputsPending()) {
      this.showHeld();
      return;
    }
    this.held = false;
    this.reload();
  }

  /** Shows the legs as loading and drops any request still running for the previous dates; nothing new is requested until the inputs have answered. */
  private showHeld(): void {
    this.hover.set(null);
    this.series.set(this.legs().map(leg => ({ leg, label: legLabel(leg), status: 'loading' as const, rows: [] })));
    this.loading.set(true);
    this.dataRequest$.next(null);
  }

  /** The expiry list has been processed and the untouched legs synchronised: send the held reload once nothing else is outstanding (the first load is sent by settleInit). */
  private reloadAfterExpiries(wasInitial: boolean, changed: boolean): void {
    if (wasInitial) return;
    if (this.held) this.flushHeld();
    else if (changed && !this.inputsPending()) this.reload();
  }

  /**
   * Applies a verified expiry list to every leg (see reconcileLegExpiry): a listed hand-picked expiry is kept; any other leg takes the nearest
   * expiry on or after To, else the latest within the dates; with no valid expiry the leg's expiry and strike are cleared. A replaced pick
   * follows the default from then on; its strike, if picked, is then checked against the new expiry (applyDefaultStrikes). True when a leg changed.
   */
  private reconcileLegExpiries(range: DateRange): boolean {
    const listed = this.expiries();
    const replaced: string[] = [];
    const before = this.legs();
    const after = before.map((leg): LegSelection => {
      const picked = !!leg.picked?.expiry;
      const target = reconcileLegExpiry(leg.expiry, picked, listed, range);
      if (target === null) {
        const { picked: _dropped, ...rest } = leg;
        return leg.expiry === '' && leg.strike === null && !leg.picked ? leg : { ...rest, expiry: '', strike: null };
      }
      if (target === leg.expiry) return leg;
      if (picked && leg.expiry) replaced.push(leg.expiry);
      const { picked: kept, ...rest } = leg;
      return { ...rest, expiry: target, ...(kept?.strike ? { picked: { strike: true } } : {}) };
    });
    // Only the user's own expiries being replaced is news; untouched legs moving to the default is routine and silent.
    const picks = [...new Set(replaced)];
    if (picks.length) {
      const one = picks.length === 1;
      this.toast.info(`${one ? 'Expiry' : 'Expiries'} ${picks.map(expiry => this.longDate(expiry)).join(', ')} ${one ? 'is' : 'are'} not listed for these dates, so ${one ? 'it was' : 'they were'} replaced by a listed expiry.`);
    }
    const changed = after.some((leg, index) => leg !== before[index]);
    if (changed) this.legs.set(after);
    return changed;
  }

  /** Asks `dd_expiry` again for the current dates after a failure; the legs are reconciled and loaded when it answers. */
  retryExpiries(): void {
    this.wantedExpiryKey = '';
    this.syncRangeExpiriesThenReload();
  }

  /** Every range mode: ask `dd_expiry` for the resolved From..To once the dates are complete and valid; anything else drops the list. */
  private syncRangeExpiries(): boolean {
    const resolved = this.rangeResolution();
    if (!('range' in resolved) || !this.symbol()) {
      this.wantedExpiryKey = '';
      this.rangeExpiries.set(null);
      this.laterExpiries.set([]);
      this.expiryError.set('');
      this.expiryLoading.set(false);
      this.initPending.delete('expiry');
      this.expiryRequest$.next(null);
      return false;
    }
    const request = { symbol: this.symbol(), from: resolved.range.from, till: resolved.range.till };
    const key = expiryKey(request);
    if (key === this.wantedExpiryKey) return false;   // the same dates: the list and what it did to the legs still hold
    this.wantedExpiryKey = key;
    this.expiryError.set('');
    this.expiryLoading.set(true);
    this.expiryRequest$.next(request);
    return true;
  }

  /**
   * The ATM for the selected To date, from that day's underlying close (or the previous session's): asked once per symbol and To date.
   * It never uses the current price. An invalid or incomplete range requests nothing.
   */
  private syncHistoricalAtm(): boolean {
    const resolved = this.rangeResolution();
    if (!('range' in resolved) || !this.symbol()) {
      this.wantedAtmKey = '';
      this.atmLoading.set(false);
      this.atmError.set('');
      this.atmInfo.set('');
      this.atmNote.set('');
      this.initPending.delete('atm');
      this.atmRequest$.next(null);
      return false;
    }
    const request = { symbol: this.symbol(), till: resolved.range.till };
    const key = `${request.symbol}|${request.till}`;
    if (key === this.wantedAtmKey) return false;
    this.wantedAtmKey = key;
    this.atmError.set('');
    this.atmInfo.set('');
    this.atmNote.set('');
    this.atmLoading.set(true);
    this.atmRequest$.next(request);
    return true;
  }

  /** An answer needed for the first load arrived: reload once, when it was the last one outstanding or it changed the legs. */
  private settleInit(kind: 'expiry' | 'atm' | 'strikes', changed: boolean): void {
    const wasPending = this.initPending.delete(kind);
    if (this.initPending.size > 0) return;
    if (wasPending) {
      // The first load is complete. A date change made meanwhile is still waiting for its own inputs.
      this.held = this.inputsPending();
      if (this.held) this.showHeld();
      else this.reload();
      return;
    }
    // A later answer: with a date change waiting, the reload is sent when every input is in; otherwise only a changed leg needs one.
    if (this.held) this.flushHeld();
    else if (changed && !this.inputsPending()) this.reload();
  }

  private setupPipelines(): void {
    this.metaRequest$.pipe(
      tap(() => {
        this.metaLoading.set(true);
        this.metaError.set('');
        this.metaNote.set('');
        this.loadError.set('');
        this.expiryStrikes.set({});
        this.strikeIssues.set({});
        this.strikesPending.set([]);
        this.metaExpiries.set([]);
        this.rangeExpiries.set(null);
        this.laterExpiries.set([]);
        this.expiryError.set('');
        this.expiryLoading.set(false);
        this.initPending.clear();
        this.held = false;
        this.wantedExpiryKey = '';
        this.expiryRequest$.next(null);
        this.atmLoading.set(false);
        this.atmError.set('');
        this.atmInfo.set('');
        this.atmNote.set('');
        this.wantedAtmKey = '';
        this.atmRequest$.next(null);
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
          this.metaError.set(`Unable to load strikes and expiries for ${symbol}.`);   // shown with Retry; no toast as well
          return of(null);
        }),
      ) : of(null))),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(data => {
      this.metaLoading.set(false);
      if (!data) return;
      const rawExpiries = Array.isArray(data.expiry_date) ? data.expiry_date : [data.expiry_date];
      const expiries = [...new Set(rawExpiries.map(value => String(value).slice(0, 10)).filter(v => /^\d{4}-\d{2}-\d{2}$/.test(v)))].sort();
      this.metaExpiries.set(expiries);
      this.underlying.set(Number.isFinite(data.underlying) ? data.underlying : null);
      this.tradeDate.set(typeof data.trade_date === 'string' ? data.trade_date.slice(0, 10) : '');
      if (!expiries.length || !(data.strike ?? []).length) {
        this.metaNote.set(`No listed strikes or expiries are available for ${this.symbol()}.`);   // a data condition, not a failure
        return;
      }
      // The default legs have no strike until their expiry's strikes (`dd_strikes`) and the underlying close are known. With a valid range that
      // close is the one of its To date and the legs also wait for the range's expiries; they load once everything is in.
      // Without a range there is no date to look up, so the listed (current) underlying is all there is.
      const rangeKnown = 'range' in this.rangeResolution();
      if (rangeKnown) this.clearAtm();   // today's spot and date are not shown as the answer for a historical To date
      const expiry = expiries[0];
      this.legs.set([this.newLeg('CE', null, expiry), this.newLeg('PE', null, expiry)]);
      this.initPending.add('strikes');
      if (rangeKnown) this.initPending.add('expiry').add('atm');
      this.syncRangeExpiries();
      this.syncHistoricalAtm();
      this.ensureStrikes();
    });

    this.atmRequest$.pipe(
      switchMap(request => (request ? this.historicalUnderlying.resolve(request.symbol, request.till).pipe(
        map(result => ({ key: `${request.symbol}|${request.till}`, till: request.till, result })),
      ) : of(null))),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(answer => {
      if (!answer || answer.key !== this.wantedAtmKey) return;
      this.atmLoading.set(false);
      const { result, till } = answer;
      if (!result.ok) {
        // No fallback to today's price: the strikes the legs already have stay, and the reason is shown.
        if (result.reason === 'no-data') {
          this.atmInfo.set(UNDERLYING_UNAVAILABLE_MESSAGE);
        } else if (result.reason === 'no-session') {
          // A data condition: there is no session to price from. Guidance, not an error.
          this.atmNote.set(`No trading session was found on or before ${this.longDate(till)}, so the ATM strike could not be set. Select a strike.`);
        } else {
          this.atmError.set(`Unable to load the closing price for ${this.longDate(till)}, so the ATM strike could not be set. Select a strike or try again.`);
        }
        this.clearAtm();
        this.settleInit('atm', this.applyDefaultStrikes());
        return;
      }
      this.atmError.set('');
      this.atmInfo.set('');
      this.atmNote.set('');
      this.underlying.set(result.underlying);
      this.tradeDate.set(result.session);
      // Legs whose strike the user never picked follow the strike of their own expiry nearest the new close; picked strikes are kept.
      this.settleInit('atm', this.applyDefaultStrikes());
    });

    this.expiryRequest$.pipe(
      switchMap(request => (request ? this.eod.getDdExpiry({ symbol: request.symbol, trade_from: request.from, trade_till: request.till }).pipe(
        // The backend also lists expiries after the dates asked for: those from From..To (inclusive) are the range's own, those after To are kept as the later ones.
        map(response => {
          const listed = Array.isArray(response.data?.expiry_date) ? cleanDates(response.data.expiry_date) : null;
          return { key: expiryKey(request), range: { from: request.from, till: request.till }, expiries: listed ? listed.filter(expiry => expiry >= request.from && expiry <= request.till) : null, later: listed ? listed.filter(expiry => expiry > request.till) : [] };
        }),
        catchError(error => of({ key: expiryKey(request), range: { from: request.from, till: request.till }, expiries: isNoExpiriesResponse(error) ? ([] as string[]) : null, later: [] as string[] })),
      ) : of(null))),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(result => {
      if (!result || result.key !== this.wantedExpiryKey) return;
      this.expiryLoading.set(false);
      if (!result.expiries) {
        // No verified list: the legs keep their selections, nothing is reconciled against the upcoming-only standard list, and no leg data is
        // requested (reload checks rangeExpiries) until a retry answers.
        this.rangeExpiries.set(null);
        this.laterExpiries.set([]);
        this.expiryError.set('Unable to load expiries for these dates.');
        const wasInitial = this.initPending.has('expiry');
        this.settleInit('expiry', false);
        this.ensureStrikes();
        this.reloadAfterExpiries(wasInitial, false);
        return;
      }
      this.expiryError.set('');
      this.rangeExpiries.set(result.expiries);
      this.laterExpiries.set(result.later);
      const changed = this.reconcileLegExpiries(result.range);
      if (changed) this.applyDefaultStrikes();   // a moved leg's strike follows its new expiry's ATM once that expiry's strikes are known
      const wasInitial = this.initPending.has('expiry');
      this.settleInit('expiry', changed);
      this.ensureStrikes();
      this.reloadAfterExpiries(wasInitial, changed);
    });

    this.strikesRequest$.pipe(
      mergeMap(request => this.expiryStrikesService.resolve(request.symbol, request.expiry).pipe(map(result => ({ request, result })))),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(({ request, result }) => {
      // A list is stored under its own expiry, so answers arriving in any order cannot overwrite each other; one for another symbol is dropped.
      if (request.symbol !== this.symbol() || !this.strikesLoadingFor(request.expiry)) return;
      this.strikesPending.update(list => list.filter(expiry => expiry !== request.expiry));
      if (result.ok) {
        this.expiryStrikes.update(lists => ({ ...lists, [request.expiry]: result.strikes }));
      } else {
        this.strikeIssues.update(issues => ({ ...issues, [request.expiry]: result.reason }));
      }
      const changed = this.applyDefaultStrikes();
      // A leg on this expiry was not requested while its strikes loaded (isRequestable): it is requested now, the others come from the cache.
      const waiting = this.legs().some(leg => leg.expiry === request.expiry);
      if (this.initPending.has('strikes')) this.settleStrikesInit(changed);
      else if (this.held) this.flushHeld();
      else if ((changed || waiting) && !this.inputsPending()) this.reload();
    });

    this.dataRequest$.pipe(
      tap(() => {
        this.loading.set(true);
        this.loadError.set('');
      }),
      // A null request only cancels what is running (see holdForExpiries).
      switchMap(request => (request ? forkJoin(request.legs.map(leg => this.loadLeg(request.symbol, leg, request.range))).pipe(
        map(results => ({ symbol: request.symbol, results })),
      ) : of(null))),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(answer => {
      if (!answer) return;
      const { symbol, results } = answer;
      this.loading.set(false);
      if (symbol !== this.symbol()) return;
      this.series.set(results);
      const failed = results.filter(r => r.status === 'error');
      if (failed.length) {
        this.loadError.set(`Unable to load EOD data for ${failed.map(f => f.label).join(', ')}.`);
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
    // A leg whose expiry's strikes are still loading is requested when they arrive (see the strikes handler); until then it shows as loading.
    if (!this.isRequestable(leg, range)) return of<LegSeries>({ ...base, status: this.strikesLoadingFor(leg.expiry) ? 'loading' : 'ready', rows: [] });
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
