import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { Subject, catchError, finalize, of, switchMap, tap } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { DefaultStock } from '../../../shared/services/constantFile';
import { LiveDataAccessComponent } from '../live-data/live-data-access.component';
import {
  AddFillRequest,
  BasketChartData,
  BasketsData,
  ClosedListData,
  ClosedSortKey,
  FillAction,
  FillSide,
  OpenListData,
  OpenSortKey,
  OptionKind,
  PerformanceData,
  PeriodGroup,
  PortfolioPosition,
  PortfolioSummary,
  PortfolioView,
  PriceSource,
  Segment,
  SegmentFilter,
  SortDir,
} from './models/portfolio.model';
import { PortfolioApiError, PortfolioApiService, toPortfolioApiError } from './portfolio-api.service';
import { buildBarChart, buildCurveChart } from './portfolio-charts.util';
import { dateLabel, isIsoDate, periodKeyLabel, todayIso } from './portfolio-dates';
import { EodQuote, adjustSummary, nearestMonthlyExpiry, overlayEodPrices } from './portfolio-eod-price';
import { ContractRef, PortfolioEodPriceService } from './portfolio-eod-price.service';
import { amount, money, money2, plural, price, signed, tone } from './portfolio-format';
import { ContractCatalog, PortfolioMarketService } from './portfolio-market.service';

const NARROW_QUERY = '(max-width: 640px)';
const SEGMENT_LABELS: Record<Segment, string> = { FUT: 'Futures', OPT: 'Options' };
const CLOSED_PAGE_SIZES = [10, 25, 50] as const;
const BASKET_CLOSED_LIMIT = 50;
const MAX_BASKET_NAME = 40;
const FILL_ACTIONS: Record<FillAction, string> = { opened: 'Opened', added: 'Added to', reduced: 'Reduced', closed: 'Closed', flipped: 'Flipped' };

interface SortState<K extends string> { key: K; dir: SortDir; }

type Dialog =
  | { kind: 'close'; position: PortfolioPosition; qty: string; price: string; error: string; busy: boolean }
  | { kind: 'rename'; id: string; name: string; error: string; busy: boolean }
  | { kind: 'delete'; id: string; name: string; busy: boolean }
  | { kind: 'chart'; id: string; name: string };

@Component({
  selector: 'app-portfolio',
  standalone: true,
  imports: [LiveDataAccessComponent],
  templateUrl: './portfolio.component.html',
  styleUrl: './portfolio.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PortfolioComponent implements OnInit {
  private readonly api = inject(PortfolioApiService);
  private readonly market = inject(PortfolioMarketService);
  private readonly eodPrices = inject(PortfolioEodPriceService);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly money = money;
  readonly price = price;
  readonly signed = signed;
  readonly tone = tone;
  readonly plural = plural;
  readonly dateLabel = dateLabel;
  readonly segmentLabels = SEGMENT_LABELS;
  readonly today = todayIso();
  readonly signedIn = this.auth.isAuthenticated;
  /** Set when the API answers 401 (expired or invalid token): the sign-in prompt replaces the screen. */
  readonly sessionExpired = signal(false);
  private sessionToastShown = false;

  readonly groupOptions: ReadonlyArray<{ value: PeriodGroup; closedLabel: string; perfLabel: string }> = [
    { value: 'trade', closedLabel: 'Trade list', perfLabel: 'Trade' },
    { value: 'day', closedLabel: 'Daily', perfLabel: 'Day' },
    { value: 'week', closedLabel: 'Weekly', perfLabel: 'Week' },
    { value: 'month', closedLabel: 'Monthly', perfLabel: 'Month' },
  ];

  /* ---------- price source ---------- */
  readonly source = signal<PriceSource>('eod');

  /* ---------- underlying autocomplete + contract choices ---------- */
  readonly underlyings = signal<string[]>([]);
  readonly underlyingsLoading = signal(true);
  readonly underlying = signal(DefaultStock);
  readonly symbolQuery = signal(DefaultStock);
  readonly suggestionsOpen = signal(false);
  readonly highlightedIndex = signal(-1);
  readonly filteredUnderlyings = computed(() => {
    const query = this.symbolQuery().trim().toLowerCase();
    return query ? this.underlyings().filter(symbol => symbol.toLowerCase().includes(query)) : this.underlyings();
  });
  readonly catalog = signal<ContractCatalog | null>(null);
  readonly catalogLoading = signal(false);
  readonly catalogError = signal('');

  /* ---------- paper-fill form ---------- */
  readonly segment = signal<Segment>('FUT');
  readonly optionType = signal<OptionKind>('CE');
  readonly strike = signal<number | null>(null);
  readonly expiry = signal('');
  readonly basketChoice = signal('');
  readonly newBasketName = signal('');
  readonly side = signal<FillSide>('Buy');
  readonly qty = signal('1');
  readonly fillPrice = signal('');
  /** Caption under the Price field: says where a prefilled price came from. */
  readonly priceHint = signal('Your fill price');
  readonly fillDate = signal(todayIso());
  readonly lotInput = signal('');
  readonly submitting = signal(false);
  readonly entryError = signal('');
  readonly entryMessage = signal('');
  readonly invalid = signal<ReadonlySet<string>>(new Set());

  readonly lotFromFeed = computed(() => this.catalog()?.lot ?? null);
  readonly lot = computed(() => {
    const fromFeed = this.lotFromFeed();
    if (fromFeed) return fromFeed;
    const typed = Number(this.lotInput());
    return Number.isInteger(typed) && typed >= 1 ? typed : null;
  });
  readonly lotHint = computed(() => {
    if (this.catalogLoading()) return 'Loading contract details…';
    if (!this.catalog()) return 'Select an underlying';
    if (!this.lotFromFeed()) return 'Lot size not provided by the data feed: enter it';
    return `${SEGMENT_LABELS[this.segment()]} · lot ${this.lotFromFeed()}${this.expiry() ? ` · exp ${dateLabel(this.expiry())}` : ''}`;
  });
  readonly canRecord = computed(() => Boolean(this.catalog() && this.expiry() && !this.catalogLoading() && (this.segment() === 'FUT' || this.strike() !== null)));

  /* ---------- views and filters ---------- */
  readonly view = signal<PortfolioView>('open');
  readonly segFilter = signal<SegmentFilter>('all');
  readonly openSort = signal<SortState<OpenSortKey>>({ key: 'notional', dir: 'desc' });
  readonly closedGroup = signal<PeriodGroup>('trade');
  readonly closedSort = signal<SortState<ClosedSortKey>>({ key: 'close_date', dir: 'desc' });
  readonly closedPage = signal(1);
  readonly closedPageSizes = CLOSED_PAGE_SIZES;
  readonly closedPageSize = signal<number>(25);
  readonly perfGroup = signal<PeriodGroup>('trade');
  readonly perfFrom = signal('');
  readonly perfTo = signal('');
  readonly narrow = signal(typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(NARROW_QUERY).matches);

  /* ---------- API data ---------- */
  readonly summary = signal<PortfolioSummary | null>(null);
  readonly openData = signal<OpenListData | null>(null);
  readonly openLoading = signal(false);
  readonly openError = signal('');
  readonly closedData = signal<ClosedListData | null>(null);
  readonly closedLoading = signal(false);
  readonly closedError = signal('');
  readonly perfData = signal<PerformanceData | null>(null);
  readonly perfLoading = signal(false);
  readonly perfError = signal('');
  readonly basketsData = signal<BasketsData | null>(null);
  readonly basketsLoading = signal(false);
  readonly basketsError = signal('');
  readonly chartData = signal<BasketChartData | null>(null);
  readonly chartLoading = signal(false);
  readonly chartError = signal('');
  readonly dialog = signal<Dialog | null>(null);

  /**
   * EOD closes for open positions the API left unpriced (`cmp: null`). Backend prices always win; see portfolio-eod-price.ts.
   * Looked up from the open list and the baskets, which together cover every open position.
   */
  readonly eodQuotes = signal<ReadonlyMap<string, EodQuote>>(new Map());
  /** False from a fill or square-off until the baskets reload, so stale positions never adjust a fresh summary. */
  private readonly basketsFresh = signal(false);

  readonly baskets = computed(() => this.basketsData()?.baskets ?? []);
  readonly openRows = computed(() => {
    const data = this.openData();
    if (!data) return [];
    const overlay = overlayEodPrices(data.results, this.eodQuotes());
    if (!overlay.priced) return data.results;
    // The API sorted before these rows had prices, so cmp / notional / unrealised order is redone here.
    const { key, dir } = this.openSort();
    if (key !== 'cmp' && key !== 'notional' && key !== 'unrealised') return overlay.positions;
    const value = (p: PortfolioPosition) => amount(p[key]);
    return overlay.positions.slice().sort((a, b) => {
      const x = value(a), y = value(b);
      if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
      return dir === 'desc' ? y - x : x - y;
    });
  });
  readonly eodNote = computed(() => (this.openRows().some(p => p.cmp_source === 'eod')
    ? ' Prices marked “EOD close” are the latest end-of-day close for that contract, not live prices; unrealised P&L uses them.'
    : ''));
  /** Baskets with EOD-priced open positions; the bucket's unrealised total gains those positions' P&L. */
  readonly basketsView = computed<BasketsData | null>(() => {
    const data = this.basketsData();
    if (!data) return null;
    const quotes = this.eodQuotes();
    const bucket = <T extends { open_positions: PortfolioPosition[]; unrealised: number }>(b: T): T => {
      const overlay = overlayEodPrices(b.open_positions, quotes);
      return overlay.priced ? { ...b, open_positions: overlay.positions, unrealised: b.unrealised + overlay.unrealisedDelta } : b;
    };
    return { ...data, baskets: data.baskets.map(bucket), unassigned: bucket(data.unassigned) };
  });
  /** The API summary plus EOD-priced rows, computed only from a baskets response newer than the last mutation. */
  readonly summaryView = computed(() => {
    const s = this.summary();
    const data = this.basketsData();
    if (!s || !data || !this.basketsFresh()) return s;
    const open = [...data.baskets.flatMap(b => b.open_positions), ...data.unassigned.open_positions];
    return adjustSummary(s, overlayEodPrices(open, this.eodQuotes()));
  });
  readonly segmentChips = computed(() => {
    const counts = this.openData()?.segment_counts ?? { all: 0, FUT: 0, OPT: 0 };
    return ([
      { value: 'all', label: 'All', count: counts.all },
      { value: 'FUT', label: SEGMENT_LABELS.FUT, count: counts.FUT },
      { value: 'OPT', label: SEGMENT_LABELS.OPT, count: counts.OPT },
    ] as const).map(chip => ({ ...chip, text: chip.count ? `${chip.label} · ${chip.count}` : chip.label }));
  });
  readonly segFilterLabel = computed(() => (this.segFilter() === 'all' ? '' : SEGMENT_LABELS[this.segFilter() as Segment].toLowerCase()));
  readonly expiringSoon = computed(() => this.openData()?.expiring_soon ?? 0);

  /** KPI strip. Unrealised P&L is never shown as ₹0 while open positions have no end-of-day price. */
  readonly kpi = computed(() => {
    const s = this.summaryView();
    if (!s) return null;
    const unpriced = s.open_positions > 0 && s.priced === 0;
    return {
      value: money(s.notional),
      valueHint: s.open_positions ? `${s.priced} of ${s.open_positions} priced · EOD` : 'No open positions',
      unreal: unpriced ? null : s.unrealised,
      unrealText: unpriced ? '—' : signed(s.unrealised),
      unrealHint: unpriced ? 'No end-of-day prices yet' : s.priced < s.open_positions ? `${s.priced} of ${s.open_positions} priced` : `Across ${plural(s.open_positions, 'open position')}`,
      real: s.realised,
      realText: signed(s.realised),
      realHint: plural(s.closed_trades, 'closed trade'),
      total: s.total,
      totalText: signed(s.total),
      totalHint: unpriced ? 'Realised only (open positions not priced)' : 'Unrealised + realised',
    };
  });

  readonly closedTrades = computed(() => {
    const data = this.closedData();
    return data?.group === 'trade' ? data.results : [];
  });
  readonly closedPeriods = computed(() => {
    const data = this.closedData();
    return data && data.group !== 'trade'
      ? data.results.map(row => ({ ...row, label: periodKeyLabel(row.key, data.group, row.end) }))
      : [];
  });
  readonly closedTotals = computed(() => this.closedData()?.totals ?? null);
  readonly closedHasNext = computed(() => { const d = this.closedData(); return d?.group === 'trade' && d.has_next; });
  readonly closedHasPrevious = computed(() => { const d = this.closedData(); return d?.group === 'trade' && d.has_previous; });

  readonly perfRangeError = computed(() => {
    const from = this.perfFrom(), to = this.perfTo();
    if ((from && !isIsoDate(from)) || (to && !isIsoDate(to))) return 'Enter valid dates.';
    return from && to && from > to ? 'From date is after To date.' : '';
  });
  /** 'none' = no closed trades at all; 'empty-range' = trades exist, none in the selected dates. */
  readonly perfState = computed<'loading' | 'none' | 'empty-range' | 'ok'>(() => {
    const data = this.perfData();
    if (!data) return 'loading';
    if (!data.has_closed_trades) return 'none';
    return data.curve.length ? 'ok' : 'empty-range';
  });
  readonly perfCurve = computed(() => {
    const data = this.perfData();
    if (!data?.curve.length) return null;
    return buildCurveChart(
      data.curve.map(p => ({ i: p.index, v: p.value, peak: p.peak, label: periodKeyLabel(p.key, data.group, p.end) })),
      data.group, this.narrow(), data.metrics.trades,
    );
  });
  readonly perfBars = computed(() => {
    const data = this.perfData();
    return data ? buildBarChart(data.period_pnl.map(p => ({ label: periodKeyLabel(p.key, data.group, p.end), v: p.value })), this.narrow()) : null;
  });
  readonly perfSegments = computed(() =>
    Object.entries(this.perfData()?.by_segment ?? {}).map(([seg, value]) => ({ label: SEGMENT_LABELS[seg as Segment] ?? seg, value: value as number })));
  readonly perfMetrics = computed(() => {
    const m = this.perfData()?.metrics;
    if (!m) return [];
    const dd = m.max_drawdown;
    return [
      { label: 'Closed trades', value: String(m.trades), hint: `${m.wins}W / ${m.losses}L` },
      { label: 'Win rate', value: `${m.win_rate.toFixed(0)}%`, hint: 'Share that were profitable' },
      { label: 'Profit factor', value: m.profit_factor === null ? 'n/a' : m.profit_factor.toFixed(2), hint: m.profit_factor === null ? 'No losing trades yet' : 'Gross profit / gross loss' },
      { label: 'Expectancy', value: money(m.expectancy), hint: 'Average per closed trade' },
      { label: 'Average win', value: money(m.avg_win), hint: `Across ${plural(m.wins, 'winner')}` },
      { label: 'Average loss', value: money(m.avg_loss), hint: `Across ${plural(m.losses, 'loser')}` },
      { label: 'Largest win', value: money(m.largest_win), hint: 'Single best trade' },
      { label: 'Max drawdown', value: money(dd.amount), hint: `Peak to trough${dd.pct === null ? '' : ` (${dd.pct.toFixed(1)}% of peak)`}` },
    ];
  });

  readonly basketBars = computed(() => {
    const data = this.chartData();
    return data?.rows.length ? buildBarChart(data.rows.map(r => ({ label: `${+r.date.slice(8)} ${dateLabel(r.date).split(' ')[1]}`, v: r.day })), this.narrow(), 'compact') : null;
  });
  readonly chartRowsDesc = computed(() => (this.chartData()?.rows ?? []).slice().reverse());

  private readonly stale = new Set<PortfolioView>(['closed', 'perf']);
  private readonly openRequest$ = new Subject<void>();
  private readonly closedRequest$ = new Subject<void>();
  private readonly perfRequest$ = new Subject<void>();
  private readonly basketsRequest$ = new Subject<void>();
  private readonly priceRequest$ = new Subject<void>();
  private readonly contractPrice$ = new Subject<ContractRef | null>();

  /** Choosing a contract prefills Price with its latest EOD close, as in the reference design; the user edits it to their fill. */
  private readonly prefillOnContractChange = effect(() => {
    const catalog = this.catalog(), expiry = this.expiry(), segment = this.segment(), type = this.optionType(), strike = this.strike();
    const ready = Boolean(catalog && expiry && (segment === 'FUT' || strike !== null));
    this.contractPrice$.next(ready ? {
      segment, symbol: catalog!.symbol, expiry_date: expiry,
      type: segment === 'OPT' ? type : '', strike: segment === 'OPT' ? (strike as number).toFixed(2) : null,
    } : null);
  });
  private readonly chartRequest$ = new Subject<{ id: string } | null>();
  private readonly catalogRequest$ = new Subject<string>();

  ngOnInit(): void {
    this.watchViewport();
    this.setupPipelines();
    if (this.signedIn()) this.bootstrap();
  }

  signIn(): void {
    void this.router.navigate(['/login'], { queryParams: { returnUrl: '/dashboard/portfolio' } });
  }

  private bootstrap(): void {
    this.loadOpen();
    this.loadBaskets();
    this.market.getUnderlyings().pipe(
      catchError(() => {
        this.toast.error('Unable to load underlyings. Please refresh and try again.');
        return of([] as string[]);
      }),
      finalize(() => this.underlyingsLoading.set(false)),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(symbols => {
      this.underlyings.set(symbols);
      const initial = symbols.includes(this.underlying()) ? this.underlying() : symbols[0];
      if (initial) this.pickUnderlying(initial);
    });
  }

  /* ================= price source ================= */

  setSource(source: PriceSource): void {
    this.source.set(source);
  }

  /* ================= underlying + contract ================= */

  onSymbolInput(value: string): void {
    this.symbolQuery.set(value);
    this.suggestionsOpen.set(true);
    this.highlightedIndex.set(-1);
  }

  openSuggestions(): void {
    this.suggestionsOpen.set(true);
  }

  pickUnderlying(symbol: string): void {
    if (!this.underlyings().includes(symbol)) return;
    this.symbolQuery.set(symbol);
    this.suggestionsOpen.set(false);
    this.highlightedIndex.set(-1);
    if (symbol === this.underlying() && this.catalog()?.symbol === symbol) return;
    this.underlying.set(symbol);
    this.catalogRequest$.next(symbol);
  }

  onSymbolKeydown(event: KeyboardEvent): void {
    const options = this.filteredUnderlyings();
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
      this.pickUnderlying(options[Math.max(0, current)]);
    } else if (event.key === 'Escape') {
      this.suggestionsOpen.set(false);
    }
  }

  onSymbolBlur(): void {
    window.setTimeout(() => {
      this.suggestionsOpen.set(false);
      // Text that is not a listed underlying reverts to the active selection.
      if (this.symbolQuery() !== this.underlying()) this.symbolQuery.set(this.underlying());
    }, 150);
  }

  setSegment(segment: Segment): void {
    this.segment.set(segment);
    if (segment === 'FUT') this.expiry.set(this.futuresExpiry(this.expiry()));
  }

  /** Futures expire monthly, but the listed expiries include weeklies: keep a monthly selection, else move to the nearest monthly. */
  private futuresExpiry(current: string): string {
    const expiries = this.catalog()?.expiries ?? [];
    const monthly = nearestMonthlyExpiry(expiries, this.catalog()?.tradeDate ?? this.today);
    const isMonthly = expiries.length > 0 && !expiries.some(e => e > current && e.slice(0, 7) === current.slice(0, 7));
    return current && expiries.includes(current) && isMonthly ? current : (monthly ?? current);
  }
  setOptionType(type: OptionKind): void { this.optionType.set(type); }
  onExpiry(value: string): void { this.expiry.set(value); }

  onStrike(raw: string): void {
    const value = Number(raw);
    this.strike.set(Number.isFinite(value) ? value : null);
  }

  onBasketChoice(value: string): void {
    this.basketChoice.set(value);
    if (value !== '__new__') this.newBasketName.set('');
  }

  /* ================= recording a fill ================= */

  record(): void {
    if (this.submitting()) return;
    this.entryMessage.set('');
    const request = this.buildAddRequest();
    if (!request) return;
    this.submitting.set(true);
    this.api.add(request).pipe(
      finalize(() => this.submitting.set(false)),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: data => {
        this.entryError.set('');
        this.invalid.set(new Set());
        const realised = amount(data.realised) ?? 0;
        let message = `${FILL_ACTIONS[data.action]} ${request.symbol}${request.type ? ` ${request.strike} ${request.type}` : ''} ${dateLabel(request.expiry_date)} — ${request.side === 'Buy' ? 'bought' : 'sold'} ${plural(request.qnt, 'lot')} at ${price(Number(request.open_price))}.`;
        if (realised !== 0) message += ` Realised ${money2(realised)}.`;
        if (data.action === 'flipped') message += ` The excess opened a new ${request.side === 'Buy' ? 'long' : 'short'} position at the fill price.`;
        if (data.position?.basket_name) message += ` Basket “${data.position.basket_name}”.`;
        this.entryMessage.set(`${message} Ledger entry only; no order was placed.`);
        this.toast.success(`${FILL_ACTIONS[data.action]} ${data.position?.label ?? request.symbol}`);
        if (request.basket_name) this.basketChoice.set(data.position?.basket ?? data.closed_trades[0]?.basket ?? '');
        this.newBasketName.set('');
        this.refreshAfterMutation();
      },
      error: (error: unknown) => this.showFormError(toPortfolioApiError(error)),
    });
  }

  /** Builds the exact API payload; returns null (and shows the problem) when a field is invalid. */
  private buildAddRequest(): AddFillRequest | null {
    const catalog = this.catalog();
    const qty = Number(this.qty()), fillPrice = Number(this.fillPrice()), lot = this.lot();
    const bad = (field: string, message: string): null => {
      this.entryError.set(message);
      this.invalid.set(new Set([field]));
      return null;
    };
    if (!catalog || !this.expiry()) return bad('expiry_date', 'Pick a contract first.');
    if (!Number.isInteger(qty) || qty < 1) return bad('qnt', 'Quantity must be a whole number of lots, at least 1.');
    if (!(fillPrice >= 0.01)) return bad('open_price', 'Price must be at least 0.01.');
    if (!isIsoDate(this.fillDate())) return bad('date', 'Enter a valid trade date.');
    if (this.expiry() < this.fillDate()) return bad('expiry_date', 'Expiry cannot be before the fill date.');
    if (!lot) return bad('lot_size', 'Lot size must be at least 1.');
    const option = this.segment() === 'OPT';
    const strike = this.strike();
    if (option && (strike === null || strike < 0.01)) return bad('strike', 'Pick a strike for the option.');
    const request: AddFillRequest = {
      segment: this.segment(),
      symbol: catalog.symbol,
      expiry_date: this.expiry(),
      side: this.side(),
      qnt: qty,
      open_price: fillPrice.toFixed(2),
      date: this.fillDate(),
      lot_size: lot,
      ...(option ? { type: this.optionType(), strike: (strike as number).toFixed(2) } : {}),
    };
    const choice = this.basketChoice();
    if (choice === '__new__') {
      const name = this.newBasketName().trim();
      if (!name) return bad('basket', 'Enter a name for the new basket, or pick "No basket".');
      if (name.length > MAX_BASKET_NAME) return bad('basket', `Basket names can be up to ${MAX_BASKET_NAME} characters.`);
      request.basket_name = name;
    } else if (choice) {
      request.basket_id = choice;
    }
    this.entryError.set('');
    this.invalid.set(new Set());
    return request;
  }

  private showFormError(error: PortfolioApiError): void {
    const keys = Object.keys(error.fields).map(key => (key === 'basket_id' || key === 'basket_name' ? 'basket' : key));
    this.invalid.set(new Set(keys));
    const messages = Object.values(error.fields).flat();
    this.entryError.set(messages.length ? messages.join(' ') : error.message);
    this.noteAuth(error);
  }

  /** A 401 means the session is gone: show the sign-in prompt, with a single notification however many calls failed. */
  private noteAuth(error: PortfolioApiError): void {
    if (!error.isUnauthorized) return;
    this.sessionExpired.set(true);
    if (!this.sessionToastShown) {
      this.sessionToastShown = true;
      this.toast.error(error.message);
    }
  }

  /* ================= views, filters, sorting ================= */

  setView(view: PortfolioView): void {
    this.view.set(view);
    this.ensureView(view);
  }

  private ensureView(view: PortfolioView): void {
    if (!this.stale.has(view)) return;
    this.stale.delete(view);
    if (view === 'closed') this.loadClosed();
    else if (view === 'perf') this.loadPerf();
  }

  setSegFilter(filter: SegmentFilter): void {
    this.segFilter.set(filter);
    this.loadOpen();
  }

  sortOpenBy(key: OpenSortKey): void {
    this.openSort.update(s => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }));
    this.loadOpen();
  }

  sortClosedBy(key: ClosedSortKey): void {
    this.closedSort.update(s => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }));
    this.closedPage.set(1);
    this.loadClosed();
  }

  setClosedGroup(group: PeriodGroup): void {
    this.closedGroup.set(group);
    this.closedPage.set(1);
    this.loadClosed();
  }

  setClosedPageSize(value: string): void {
    const size = Number(value);
    if (!(CLOSED_PAGE_SIZES as readonly number[]).includes(size) || size === this.closedPageSize()) return;
    this.closedPageSize.set(size);
    this.closedPage.set(1);
    this.loadClosed();
  }

  closedPrevious(): void {
    if (this.closedHasPrevious() && !this.closedLoading()) { this.closedPage.update(p => p - 1); this.loadClosed(); }
  }

  closedNext(): void {
    if (this.closedHasNext() && !this.closedLoading()) { this.closedPage.update(p => p + 1); this.loadClosed(); }
  }

  setPerfGroup(group: PeriodGroup): void {
    this.perfGroup.set(group);
    this.loadPerf();
  }

  setPerfFrom(value: string): void { this.perfFrom.set(value); this.loadPerf(); }
  setPerfTo(value: string): void { this.perfTo.set(value); this.loadPerf(); }

  resetPerfRange(): void {
    this.perfFrom.set('');
    this.perfTo.set('');
    this.loadPerf();
  }

  ariaSort<K extends string>(state: SortState<K>, key: K): 'ascending' | 'descending' | 'none' {
    return state.key !== key ? 'none' : state.dir === 'desc' ? 'descending' : 'ascending';
  }

  /* ================= row helpers (API strings → display) ================= */

  priceCell(value: string | null): string { const n = amount(value); return n === null ? '' : price(n); }
  hasPrice(value: string | null): boolean { return amount(value) !== null; }
  /** Caption under CMP: where a price came from when it is not the API's own, or that there is none. */
  cmpNote(p: PortfolioPosition): string {
    if (p.cmp_source === 'eod') return `EOD close${p.cmp_date ? ' · ' + dateLabel(p.cmp_date).replace(/ \d{4}$/, '') : ''}`;
    return amount(p.cmp) === null ? 'not priced' : '';
  }
  unrealCell(p: PortfolioPosition): string { const n = amount(p.unrealised); return n === null ? '—' : signed(n); }
  unrealTone(p: PortfolioPosition): string { return tone(amount(p.unrealised) ?? 0); }
  moneyCell(value: string | null): string { return money(amount(value) ?? 0); }
  realisedCell(p: PortfolioPosition): string { return signed(amount(p.realised) ?? 0); }
  realisedTone(p: PortfolioPosition): string { return tone(amount(p.realised) ?? 0); }
  eodCell(value: number): string { return Math.abs(value) < 0.5 ? '—' : signed(value); }

  /** Basket/unassigned unrealised: "—" while none of its open positions has a price. */
  bucketUnrealised(open: PortfolioPosition[], value: number): { text: string; tone: string } {
    const unpriced = open.length > 0 && open.every(p => p.cmp === null);
    return unpriced ? { text: '—', tone: '' } : { text: signed(value), tone: tone(value) };
  }

  /* ================= dialogs ================= */

  openSquareOff(position: PortfolioPosition): void {
    const suggested = amount(position.cmp) ?? amount(position.avg_cost) ?? 0;
    this.dialog.set({ kind: 'close', position, qty: '', price: suggested ? suggested.toFixed(2) : '', error: '', busy: false });
  }

  onCloseQty(value: string): void { this.patchDialog('close', { qty: value }); }
  onClosePrice(value: string): void { this.patchDialog('close', { price: value }); }

  confirmSquareOff(): void {
    const dialog = this.dialog();
    if (dialog?.kind !== 'close' || dialog.busy) return;
    const closingPrice = Number(dialog.price);
    if (!(closingPrice >= 0.01)) return this.patchDialog('close', { error: 'Enter a closing price of at least 0.01.' });
    let lots: number | undefined;
    if (dialog.qty.trim() !== '') {
      lots = Number(dialog.qty);
      if (!Number.isInteger(lots) || lots < 1) return this.patchDialog('close', { error: 'Lots to close must be a whole number, at least 1.' });
      if (lots > dialog.position.qnt) return this.patchDialog('close', { error: `Cannot square off ${lots} lots; only ${dialog.position.qnt} open.` });
    }
    this.patchDialog('close', { busy: true, error: '' });
    this.api.squareOff({ id: dialog.position.id, closing_price: closingPrice.toFixed(2), ...(lots ? { qnt: lots } : {}) }).pipe(
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: data => {
        const closed = lots ?? dialog.position.qnt;
        this.dialog.set(null);
        this.entryMessage.set(`Squared off ${plural(data.closed_trade.qnt || closed, 'lot')} of ${dialog.position.label} at ${price(closingPrice)} — realised ${money2(amount(data.realised) ?? 0)}.${data.position ? ` ${plural(data.position.qnt, 'lot')} remain open.` : ''} Ledger entry only; no order was placed.`);
        this.refreshAfterMutation();
      },
      error: (error: unknown) => {
        const err = toPortfolioApiError(error);
        this.patchDialog('close', { busy: false, error: err.message });
        this.noteAuth(err);
        if (err.isNotFound) this.refreshAfterMutation();   // the position changed elsewhere: reload
      },
    });
  }

  openRename(id: string, name: string): void {
    this.dialog.set({ kind: 'rename', id, name, error: '', busy: false });
  }

  onRenameInput(value: string): void { this.patchDialog('rename', { name: value }); }

  confirmRename(): void {
    const dialog = this.dialog();
    if (dialog?.kind !== 'rename' || dialog.busy) return;
    const name = dialog.name.trim();
    if (!name) return this.patchDialog('rename', { error: 'Enter a basket name.' });
    if (name.length > MAX_BASKET_NAME) return this.patchDialog('rename', { error: `Basket names can be up to ${MAX_BASKET_NAME} characters.` });
    this.patchDialog('rename', { busy: true, error: '' });
    this.api.renameBasket({ id: dialog.id, name }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.dialog.set(null);
        this.toast.success(`Basket renamed to “${name}”`);
        this.refreshAfterMutation();
      },
      error: (error: unknown) => {
        const err = toPortfolioApiError(error);
        this.patchDialog('rename', { busy: false, error: err.message });
        this.noteAuth(err);
        if (err.isNotFound) this.loadBaskets();
      },
    });
  }

  openDelete(id: string, name: string): void {
    this.dialog.set({ kind: 'delete', id, name, busy: false });
  }

  confirmDelete(): void {
    const dialog = this.dialog();
    if (dialog?.kind !== 'delete' || dialog.busy) return;
    this.patchDialog('delete', { busy: true });
    this.api.removeBasket({ id: dialog.id }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: data => {
        if (this.basketChoice() === dialog.id) this.basketChoice.set('');
        this.dialog.set(null);
        this.toast.success(`Basket “${data.name}” removed; ${plural(data.unassigned, 'position')} now unassigned`);
        this.refreshAfterMutation();
      },
      error: (error: unknown) => {
        const err = toPortfolioApiError(error);
        this.dialog.set(null);
        this.toast.error(err.message);
        this.noteAuth(err);
        this.loadBaskets();
      },
    });
  }

  openBasketChart(id: string, name: string): void {
    this.dialog.set({ kind: 'chart', id, name });
    this.chartData.set(null);
    this.chartError.set('');
    this.chartRequest$.next({ id });
  }

  closeDialog(): void {
    if (this.dialog()?.kind === 'chart') this.chartRequest$.next(null);
    this.dialog.set(null);
  }

  private patchDialog<K extends Dialog['kind']>(kind: K, patch: Partial<Extract<Dialog, { kind: K }>>): void {
    this.dialog.update(d => (d?.kind === kind ? ({ ...d, ...patch } as Dialog) : d));
  }

  /* ================= data loading ================= */

  loadOpen(): void { this.openRequest$.next(); }
  loadClosed(): void { this.closedRequest$.next(); }
  loadBaskets(): void { this.basketsRequest$.next(); }

  loadPerf(): void {
    if (this.perfRangeError()) return;
    this.perfRequest$.next();
  }

  /** After a fill or square-off: the open list and baskets reload now; closed trades and performance reload when shown. */
  private refreshAfterMutation(): void {
    this.stale.add('closed');
    this.stale.add('perf');
    this.basketsFresh.set(false);
    this.loadOpen();
    this.loadBaskets();
    this.ensureView(this.view());
  }

  /** switchMap everywhere: a slow response for an earlier selection can never overwrite the latest one. */
  private setupPipelines(): void {
    const failure = (error: unknown, message: (text: string) => void): null => {
      const err = toPortfolioApiError(error);
      message(err.message);
      this.noteAuth(err);
      return null;
    };

    this.openRequest$.pipe(
      tap(() => { this.openLoading.set(true); this.openError.set(''); }),
      switchMap(() => this.api.openList({ segment: this.segFilter(), sort_by: this.openSort().key, sort_dir: this.openSort().dir }).pipe(
        catchError(error => of(failure(error, text => this.openError.set(text)))))),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(data => {
      this.openLoading.set(false);
      if (!data) return;
      this.openData.set(data);
      this.summary.set(data.summary);
      this.priceRequest$.next();
    });

    this.closedRequest$.pipe(
      tap(() => { this.closedLoading.set(true); this.closedError.set(''); }),
      switchMap(() => this.api.closedList({
        group: this.closedGroup(), sort_by: this.closedSort().key, sort_dir: this.closedSort().dir,
        page: this.closedPage(), page_size: this.closedPageSize(),
      }).pipe(catchError(error => of(failure(error, text => this.closedError.set(text)))))),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(data => {
      this.closedLoading.set(false);
      if (!data) return;
      this.closedData.set(data);
      this.summary.set(data.summary);
    });

    this.perfRequest$.pipe(
      tap(() => { this.perfLoading.set(true); this.perfError.set(''); }),
      switchMap(() => this.api.performance({
        group: this.perfGroup(),
        ...(this.perfFrom() ? { date_from: this.perfFrom() } : {}),
        ...(this.perfTo() ? { date_to: this.perfTo() } : {}),
      }).pipe(catchError(error => of(failure(error, text => this.perfError.set(text)))))),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(data => {
      this.perfLoading.set(false);
      if (!data) return;
      this.perfData.set(data);
      this.summary.set(data.summary);
    });

    this.basketsRequest$.pipe(
      tap(() => { this.basketsLoading.set(true); this.basketsError.set(''); }),
      switchMap(() => this.api.baskets({ closed_limit: BASKET_CLOSED_LIMIT }).pipe(
        catchError(error => of(failure(error, text => this.basketsError.set(text)))))),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(data => {
      this.basketsLoading.set(false);
      if (!data) return;
      this.basketsData.set(data);
      this.summary.set(data.summary);
      this.basketsFresh.set(true);
      this.priceRequest$.next();
    });

    this.contractPrice$.pipe(
      tap(contract => { if (contract) { this.fillPrice.set(''); this.priceHint.set('Looking up the EOD price…'); } else this.priceHint.set('Your fill price'); }),
      switchMap(contract => (contract ? this.eodPrices.contractQuote(contract).pipe(catchError(() => of(null))) : of(undefined))),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(quote => {
      if (quote === undefined) return;
      if (quote) {
        this.fillPrice.set(quote.close.toFixed(2));
        this.priceHint.set(`EOD close · ${dateLabel(quote.date).replace(/ \d{4}$/, '')}. Edit to your fill`);
      } else {
        this.priceHint.set('No EOD price for this contract. Enter your fill');
      }
    });

    this.priceRequest$.pipe(
      switchMap(() => {
        const open = [
          ...(this.openData()?.results ?? []),
          ...(this.basketsData()?.baskets.flatMap(b => b.open_positions) ?? []),
          ...(this.basketsData()?.unassigned.open_positions ?? []),
        ];
        return this.eodPrices.quotesFor(open).pipe(catchError(() => of(null)));
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(quotes => { if (quotes) this.eodQuotes.set(quotes); });

    this.chartRequest$.pipe(
      tap(request => { this.chartLoading.set(Boolean(request)); this.chartError.set(''); }),
      switchMap(request => (request
        ? this.api.basketChart({ id: request.id }).pipe(catchError(error => of(failure(error, text => this.chartError.set(text)))))
        : of(null))),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(data => {
      this.chartLoading.set(false);
      this.chartData.set(data);
    });

    this.catalogRequest$.pipe(
      tap(() => {
        this.catalogLoading.set(true);
        this.catalogError.set('');
        this.catalog.set(null);
        this.strike.set(null);
        this.expiry.set('');
      }),
      switchMap(symbol => this.market.getCatalog(symbol).pipe(
        catchError(() => {
          this.catalogError.set(`Unable to load contracts for ${symbol}. Please try again.`);
          this.toast.error(this.catalogError());
          return of(null);
        }))),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(catalog => {
      this.catalogLoading.set(false);
      if (!catalog) return;
      if (!catalog.expiries.length) this.catalogError.set(`No listed expiries are available for ${catalog.symbol}.`);
      this.catalog.set(catalog);
      this.expiry.set(catalog.expiries[0] ?? '');
      if (this.segment() === 'FUT') this.expiry.set(this.futuresExpiry(this.expiry()));
      this.strike.set(catalog.atmStrike !== null && catalog.strikes.includes(catalog.atmStrike) ? catalog.atmStrike : (catalog.strikes[0] ?? null));
    });
  }

  private watchViewport(): void {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(NARROW_QUERY);
    const listener = (event: MediaQueryListEvent) => this.narrow.set(event.matches);
    query.addEventListener('change', listener);
    this.destroyRef.onDestroy(() => query.removeEventListener('change', listener));
  }
}
