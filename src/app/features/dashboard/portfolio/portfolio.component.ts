import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, catchError, finalize, forkJoin, of, switchMap, tap } from 'rxjs';
import { ToastService } from '../../../core/services/toast.service';
import { DefaultStock } from '../../../shared/services/constantFile';
import { LiveDataAccessComponent } from '../live-data/live-data-access.component';
import {
  BasketEodRow,
  FillSide,
  OpenPosition,
  OptionKind,
  PeriodGroup,
  PortfolioView,
  PositionKind,
  PriceSource,
  SegmentFilter,
} from './models/portfolio.model';
import { ContractCatalog, LatestClose, PortfolioMarketService } from './portfolio-market.service';
import { PortfolioStoreService } from './portfolio-store.service';
import { makeContract } from './portfolio-contract';
import {
  buildBasketEodSeries,
  buildCurvePoints,
  dateLabel,
  daysToExpiry,
  filterByExitDate,
  groupClosed,
  isIsoDate,
  notional,
  notionalTotal,
  periodLabel,
  periodPnlSeries,
  realisedBySegment,
  realisedTotal,
  tradeStats,
  unrealised,
  unrealisedTotal,
} from './portfolio-ledger';
import { buildBarChart, buildCurveChart } from './portfolio-charts.util';
import { money, money2, plural, price, signed, tone } from './portfolio-format';

const NARROW_QUERY = '(max-width: 640px)';
const SEGMENT_LABELS: Record<PositionKind, string> = { future: 'Futures', option: 'Options' };

type OpenSortKey = 'symbol' | 'qty' | 'avg' | 'cmp' | 'notional' | 'unreal';
type ClosedSortKey = 'symbol' | 'qty' | 'entry' | 'exit' | 'realised' | 'exit_date';
interface SortState<K extends string> { key: K; desc: boolean; }

type Dialog =
  | { kind: 'close'; key: string; price: string; error: string }
  | { kind: 'rename'; id: string; name: string; error: string }
  | { kind: 'delete'; id: string }
  | { kind: 'chart'; id: string };

const todayIso = (): string => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

@Component({
  selector: 'app-portfolio',
  standalone: true,
  imports: [LiveDataAccessComponent],
  templateUrl: './portfolio.component.html',
  styleUrl: './portfolio.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PortfolioComponent implements OnInit {
  private readonly store = inject(PortfolioStoreService);
  private readonly market = inject(PortfolioMarketService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly money = money;
  readonly money2 = money2;
  readonly price = price;
  readonly signed = signed;
  readonly tone = tone;
  readonly plural = plural;
  readonly dateLabel = dateLabel;
  readonly segmentLabels = SEGMENT_LABELS;
  readonly notionalOf = notional;
  readonly unrealOf = unrealised;
  readonly groupOptions: ReadonlyArray<{ value: PeriodGroup; closedLabel: string; perfLabel: string }> = [
    { value: 'trade', closedLabel: 'Trade list', perfLabel: 'Trade' },
    { value: 'day', closedLabel: 'Daily', perfLabel: 'Day' },
    { value: 'week', closedLabel: 'Weekly', perfLabel: 'Week' },
    { value: 'month', closedLabel: 'Monthly', perfLabel: 'Month' },
  ];
  readonly persisted = this.store.persisted;
  readonly today = todayIso();

  /* ---------- price source ---------- */
  readonly source = signal<PriceSource>('eod');

  /* ---------- underlying autocomplete ---------- */
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

  /* ---------- contract + fill form ---------- */
  readonly catalog = signal<ContractCatalog | null>(null);
  readonly catalogLoading = signal(false);
  readonly catalogError = signal('');
  readonly segment = signal<PositionKind>('future');
  readonly optionType = signal<OptionKind>('CE');
  readonly strike = signal<number | null>(null);
  readonly expiry = signal('');
  readonly basketChoice = signal('');
  readonly newBasketName = signal('');
  readonly side = signal<FillSide>('buy');
  readonly qty = signal('1');
  readonly fillPrice = signal('');
  readonly fillDate = signal(todayIso());
  readonly priceHint = signal('');
  readonly priceLoading = signal(false);
  readonly entryError = signal('');
  readonly entryMessage = signal('');
  readonly invalidField = signal<'qty' | 'price' | 'basket' | 'date' | ''>('');
  private priceTouched = false;

  readonly eodDateLabel = computed(() => {
    const date = this.catalog()?.tradeDate;
    return date ? dateLabel(date) : '';
  });
  readonly lot = computed(() => this.catalog()?.lot ?? null);
  readonly selectedContract = computed(() => {
    const catalog = this.catalog(), expiry = this.expiry(), lot = this.lot();
    if (!catalog || !expiry || !lot) return null;
    if (this.segment() === 'future') return makeContract({ underlying: catalog.symbol, kind: 'future', expiry, strike: null, optionType: null, lot });
    const strike = this.strike();
    return strike === null ? null : makeContract({ underlying: catalog.symbol, kind: 'option', expiry, strike, optionType: this.optionType(), lot });
  });
  readonly lotHint = computed(() => {
    const contract = this.selectedContract(), lot = this.lot();
    if (this.catalogLoading()) return 'Loading contract details…';
    if (!lot) return this.catalog() ? 'Lot size not provided by the data feed' : 'Select an underlying';
    return `${SEGMENT_LABELS[this.segment()]} · lot ${lot}${contract ? ` · exp ${dateLabel(contract.expiry)}` : ''}`;
  });

  /* ---------- ledger + marks ---------- */
  readonly baskets = this.store.baskets;
  private readonly cmps = signal<ReadonlyMap<string, LatestClose | null>>(new Map());
  readonly pricesLoading = signal(false);
  readonly positions = computed<OpenPosition[]>(() => {
    const marks = this.cmps();
    return this.store.ledger().positions.map(position => ({ ...position, cmp: marks.get(position.contract.key)?.close ?? null }));
  });
  readonly closed = computed(() => this.store.ledger().closed);

  /* ---------- summary ---------- */
  readonly summary = computed(() => {
    const open = this.positions(), closed = this.closed();
    const unreal = unrealisedTotal(open), real = realisedTotal(closed);
    const priced = open.filter(p => p.cmp !== null).length;
    return {
      value: money(notionalTotal(open)),
      valueHint: `${priced} of ${open.length} priced · EOD`,
      unreal, unrealText: signed(unreal), unrealHint: `Across ${plural(open.length, 'open position')}`,
      real, realText: signed(real), realHint: plural(closed.length, 'closed trade'),
      total: unreal + real, totalText: signed(unreal + real),
    };
  });

  /* ---------- views ---------- */
  readonly view = signal<PortfolioView>('open');
  readonly segFilter = signal<SegmentFilter>('all');
  readonly openSort = signal<SortState<OpenSortKey>>({ key: 'notional', desc: true });
  readonly closedSort = signal<SortState<ClosedSortKey>>({ key: 'exit_date', desc: true });
  readonly closedGroup = signal<PeriodGroup>('trade');
  readonly perfGroup = signal<PeriodGroup>('trade');
  readonly perfFrom = signal('');
  readonly perfTo = signal('');
  readonly narrow = signal(typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(NARROW_QUERY).matches);

  readonly segCounts = computed(() => {
    const open = this.positions();
    return { all: open.length, future: open.filter(p => p.kind === 'future').length, option: open.filter(p => p.kind === 'option').length };
  });
  readonly segmentChips = computed(() => {
    const counts = this.segCounts();
    return ([
      { value: 'all', label: 'All', count: counts.all },
      { value: 'future', label: SEGMENT_LABELS.future, count: counts.future },
      { value: 'option', label: SEGMENT_LABELS.option, count: counts.option },
    ] as const).map(chip => ({ ...chip, text: chip.count ? `${chip.label} · ${chip.count}` : chip.label }));
  });
  readonly segFilterLabel = computed(() => (this.segFilter() === 'all' ? '' : SEGMENT_LABELS[this.segFilter() as PositionKind].toLowerCase()));
  readonly openRows = computed(() => {
    const filter = this.segFilter();
    const { key, desc } = this.openSort();
    const value = (p: OpenPosition): string | number => ({
      symbol: p.contract.label, qty: Math.abs(p.qty), avg: p.avg, cmp: p.cmp ?? -Infinity, notional: notional(p), unreal: unrealised(p),
    })[key];
    return this.positions()
      .filter(p => filter === 'all' || p.kind === filter)
      .sort((a, b) => this.compare(value(a), value(b), desc));
  });
  readonly expiringSoon = computed(() => this.openRows().filter(p => { const d = this.dte(p); return d !== null && d <= 7; }).length);

  readonly closedRows = computed(() => {
    const { key, desc } = this.closedSort();
    const value = (t: ReturnType<typeof this.closed>[number]): string | number => ({
      symbol: t.label, qty: t.qty, entry: t.entry, exit: t.exit, realised: t.realised, exit_date: t.exitDate,
    })[key];
    return this.closed().slice().sort((a, b) => this.compare(value(a), value(b), desc));
  });
  readonly closedGroups = computed(() => {
    const group = this.closedGroup();
    return groupClosed(this.closed(), group).sort((a, b) => b.key.localeCompare(a.key))
      .map(entry => ({ ...entry, label: periodLabel(entry.key, group), winRate: entry.trades ? (entry.wins / entry.trades) * 100 : 0 }));
  });
  readonly closedWins = computed(() => this.closed().filter(t => t.realised > 0).length);

  readonly perfTrades = computed(() => filterByExitDate(this.closed(), this.perfFrom(), this.perfTo()));
  readonly perfStats = computed(() => tradeStats(this.perfTrades()));
  readonly perfCurve = computed(() => {
    const trades = this.perfTrades();
    return buildCurveChart(buildCurvePoints(trades, this.perfGroup()), this.perfGroup(), this.narrow(), trades.length);
  });
  readonly perfBars = computed(() => buildBarChart(periodPnlSeries(this.perfTrades(), this.perfGroup()), this.narrow()));
  readonly perfSegments = computed(() => realisedBySegment(this.perfTrades()));
  readonly perfRangeError = computed(() => {
    const from = this.perfFrom(), to = this.perfTo();
    if ((from && !isIsoDate(from)) || (to && !isIsoDate(to))) return 'Enter valid dates.';
    return from && to && from > to ? 'From date is after To date.' : '';
  });
  readonly perfMetrics = computed(() => {
    const s = this.perfStats();
    return [
      { label: 'Closed trades', value: String(s.trades), hint: `${s.wins}W / ${s.losses}L` },
      { label: 'Win rate', value: `${s.winRate.toFixed(0)}%`, hint: 'Share that were profitable' },
      { label: 'Profit factor', value: s.profitFactor === null ? 'n/a' : s.profitFactor.toFixed(2), hint: s.profitFactor === null ? 'No losing trades yet' : 'Gross profit / gross loss' },
      { label: 'Expectancy', value: money(s.expectancy), hint: 'Average per closed trade' },
      { label: 'Average win', value: money(s.avgWin), hint: `Across ${plural(s.wins, 'winner')}` },
      { label: 'Average loss', value: money(s.avgLoss), hint: `Across ${plural(s.losses, 'loser')}` },
      { label: 'Largest win', value: money(s.largestWin), hint: 'Single best trade' },
      { label: 'Max drawdown', value: money(s.dd.amount), hint: `Peak to trough${s.dd.pct === null ? '' : ` (${s.dd.pct.toFixed(1)}% of peak)`}` },
    ];
  });

  /* ---------- baskets ---------- */
  readonly basketCards = computed(() => {
    const open = this.positions(), closed = this.closed();
    const cards = this.baskets().slice().sort((a, b) => a.name.localeCompare(b.name)).map(basket => {
      const members = open.filter(p => p.basketId === basket.id);
      const closedMembers = closed.filter(t => t.basketId === basket.id);
      return {
        id: basket.id, name: basket.name, members, closedMembers,
        unreal: unrealisedTotal(members), realised: realisedTotal(closedMembers),
      };
    });
    const unassigned = open.filter(p => !p.basketId);
    return { cards, unassigned, unassignedUnreal: unrealisedTotal(unassigned) };
  });

  /* ---------- dialogs ---------- */
  readonly dialog = signal<Dialog | null>(null);
  readonly chartLoading = signal(false);
  readonly chartError = signal('');
  readonly basketEod = signal<{ rows: BasketEodRow[]; unpriced: string[] } | null>(null);
  readonly basketBars = computed(() => {
    const data = this.basketEod();
    return data ? buildBarChart(data.rows.map(r => ({ label: `${+r.date.slice(8)} ${dateLabel(r.date).split(' ')[1]}`, v: r.day })), this.narrow(), 'compact') : null;
  });
  readonly basketEodRowsDesc = computed(() => (this.basketEod()?.rows ?? []).slice().reverse());
  readonly dialogBasketName = computed(() => {
    const dialog = this.dialog();
    return dialog && 'id' in dialog ? (this.baskets().find(b => b.id === dialog.id)?.name ?? '') : '';
  });
  readonly closeTarget = computed(() => {
    const dialog = this.dialog();
    return dialog?.kind === 'close' ? this.positions().find(p => p.contract.key === dialog.key) ?? null : null;
  });

  private readonly catalogRequest$ = new Subject<string>();
  private readonly suggestRequest$ = new Subject<ReturnType<typeof makeContract> | null>();
  private readonly marksRequest$ = new Subject<OpenPosition[]>();
  private readonly chartRequest$ = new Subject<string>();

  constructor() {
    // The contract selection drives the suggested entry price (latest EOD close).
    effect(() => {
      const contract = this.selectedContract();
      untracked(() => {
        this.priceTouched = false;
        this.suggestRequest$.next(contract);
      });
    });
    // Whenever the set of open contracts changes, their EOD marks are refreshed.
    effect(() => {
      const open = this.store.ledger().positions;
      const signature = open.map(p => p.contract.key).join(',');
      untracked(() => this.refreshMarks(signature, open));
    });
  }

  ngOnInit(): void {
    this.watchViewport();
    this.setupPipelines();
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

  setSegment(segment: PositionKind): void {
    this.segment.set(segment);
  }

  setOptionType(type: OptionKind): void {
    this.optionType.set(type);
  }

  onStrike(raw: string): void {
    const value = Number(raw);
    this.strike.set(Number.isFinite(value) ? value : null);
  }

  onExpiry(value: string): void {
    this.expiry.set(value);
  }

  onBasketChoice(value: string): void {
    this.basketChoice.set(value);
    if (value !== '__new__') this.newBasketName.set('');
  }

  onPriceInput(value: string): void {
    this.priceTouched = true;
    this.fillPrice.set(value);
  }

  /* ================= recording a fill ================= */

  record(): void {
    this.entryMessage.set('');
    const contract = this.selectedContract();
    const qty = parseFloat(this.qty()), fillPrice = parseFloat(this.fillPrice());
    if (!contract) return this.fail('Pick a contract first.', '');
    if (!(qty > 0)) return this.fail('Quantity must be greater than 0.', 'qty');
    if (!Number.isInteger(qty)) return this.fail('Quantity is in whole lots.', 'qty');
    if (!(fillPrice > 0)) return this.fail('Price must be greater than 0.', 'price');
    if (!isIsoDate(this.fillDate())) return this.fail('Enter a valid trade date.', 'date');
    const creating = this.basketChoice() === '__new__';
    const outcome = this.store.recordFill({
      contract, side: this.side(), qty, price: fillPrice, date: this.fillDate(),
      basketId: creating ? '' : this.basketChoice(),
      newBasketName: creating ? this.newBasketName() : undefined,
    });
    if (!outcome.ok) return this.fail(outcome.error, creating ? 'basket' : '');
    this.entryError.set('');
    this.invalidField.set('');
    const verb = { opened: 'Opened', added: 'Added to', reduced: 'Reduced', closed: 'Closed', flipped: 'Flipped' }[outcome.action];
    let message = `${verb} ${contract.label} — ${this.side() === 'buy' ? 'bought' : 'sold'} ${plural(qty, 'lot')} at ${price(fillPrice)}.`;
    if (outcome.realised !== 0) message += ` Realised ${money2(outcome.realised)}.`;
    if (outcome.action === 'flipped') message += ` The excess opened a new ${this.side() === 'buy' ? 'long' : 'short'} at the fill price.`;
    const basket = outcome.basket ?? this.baskets().find(b => b.id === this.basketChoice());
    if (basket) message += ` Added to basket “${basket.name}”.`;
    this.entryMessage.set(`${message} Ledger entry only; no order was placed.`);
    if (outcome.basket) this.basketChoice.set(outcome.basket.id);
    this.newBasketName.set('');
  }

  private fail(message: string, field: 'qty' | 'price' | 'basket' | 'date' | ''): void {
    this.entryError.set(message);
    this.invalidField.set(field);
  }

  /* ================= table interaction ================= */

  setView(view: PortfolioView): void {
    this.view.set(view);
  }

  sortOpenBy(key: OpenSortKey): void {
    this.openSort.update(s => ({ key, desc: s.key === key ? !s.desc : true }));
  }

  sortClosedBy(key: ClosedSortKey): void {
    this.closedSort.update(s => ({ key, desc: s.key === key ? !s.desc : true }));
  }

  ariaSort<K extends string>(state: SortState<K>, key: K): 'ascending' | 'descending' | 'none' {
    return state.key !== key ? 'none' : state.desc ? 'descending' : 'ascending';
  }

  /** A zero-ish day shows a dash, as in the prototype. */
  eodCell(value: number): string {
    return Math.abs(value) < 0.5 ? '—' : signed(value);
  }

  dte(position: OpenPosition): number | null {
    return daysToExpiry(position.contract.expiry, this.today);
  }

  resetPerfRange(): void {
    this.perfFrom.set('');
    this.perfTo.set('');
  }

  /* ================= dialogs ================= */

  openSquareOff(key: string): void {
    const position = this.positions().find(p => p.contract.key === key);
    if (!position) return;
    this.dialog.set({ kind: 'close', key, price: price(position.cmp ?? position.avg).replace(/,/g, ''), error: '' });
  }

  onDialogPrice(value: string): void {
    this.dialog.update(d => (d?.kind === 'close' ? { ...d, price: value } : d));
  }

  confirmSquareOff(): void {
    const dialog = this.dialog();
    if (dialog?.kind !== 'close') return;
    const closePrice = parseFloat(dialog.price);
    if (!(closePrice > 0)) {
      this.dialog.set({ ...dialog, error: 'Enter a price greater than 0.' });
      return;
    }
    const target = this.closeTarget();
    const outcome = this.store.squareOff(dialog.key, closePrice, this.today);
    if (!outcome.ok) {
      this.dialog.set({ ...dialog, error: outcome.error });
      return;
    }
    this.dialog.set(null);
    this.entryMessage.set(`Squared off ${target?.contract.label ?? 'position'} at ${price(closePrice)} — realised ${money2(outcome.realised)}. Ledger entry only; no order was placed.`);
  }

  openRename(id: string): void {
    const basket = this.baskets().find(b => b.id === id);
    if (basket) this.dialog.set({ kind: 'rename', id, name: basket.name, error: '' });
  }

  onDialogName(value: string): void {
    this.dialog.update(d => (d?.kind === 'rename' ? { ...d, name: value } : d));
  }

  confirmRename(): void {
    const dialog = this.dialog();
    if (dialog?.kind !== 'rename') return;
    const error = this.store.renameBasket(dialog.id, dialog.name);
    if (error) this.dialog.set({ ...dialog, error });
    else this.dialog.set(null);
  }

  openDelete(id: string): void {
    this.dialog.set({ kind: 'delete', id });
  }

  confirmDelete(): void {
    const dialog = this.dialog();
    if (dialog?.kind !== 'delete') return;
    if (this.basketChoice() === dialog.id) this.basketChoice.set('');
    this.store.deleteBasket(dialog.id);
    this.dialog.set(null);
  }

  openBasketChart(id: string): void {
    this.dialog.set({ kind: 'chart', id });
    this.basketEod.set(null);
    this.chartError.set('');
    this.chartRequest$.next(id);
  }

  closeDialog(): void {
    if (this.dialog()?.kind === 'chart') this.chartRequest$.next('');
    this.dialog.set(null);
  }

  /* ================= internals ================= */

  private compare(a: string | number, b: string | number, desc: boolean): number {
    if (typeof a === 'string' || typeof b === 'string') return desc ? String(b).localeCompare(String(a)) : String(a).localeCompare(String(b));
    return desc ? b - a : a - b;
  }

  private refreshMarks(signature: string, open: OpenPosition[]): void {
    if (!signature) {
      this.cmps.set(new Map());
      this.marksRequest$.next([]);
      return;
    }
    this.marksRequest$.next(open);
  }

  /** switchMap everywhere: a slow response for an earlier selection can never overwrite the latest one. */
  private setupPipelines(): void {
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
        }),
      )),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(catalog => {
      this.catalogLoading.set(false);
      if (!catalog) return;
      if (!catalog.expiries.length) this.catalogError.set(`No listed expiries are available for ${catalog.symbol}.`);
      this.catalog.set(catalog);
      this.expiry.set(catalog.expiries[0] ?? '');
      this.strike.set(catalog.atmStrike !== null && catalog.strikes.includes(catalog.atmStrike) ? catalog.atmStrike : (catalog.strikes[0] ?? null));
    });

    this.suggestRequest$.pipe(
      tap(contract => {
        this.priceLoading.set(Boolean(contract));
        this.priceHint.set(contract ? '' : '');
      }),
      switchMap(contract => (contract ? this.market.getLatestClose(contract) : of(null))),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(close => {
      this.priceLoading.set(false);
      this.priceHint.set(close ? `EOD close ${dateLabel(close.date)} — edit to your fill` : this.selectedContract() ? 'No EOD price available — enter your fill price' : '');
      if (close && !this.priceTouched) this.fillPrice.set(price(close.close).replace(/,/g, ''));
      if (!close && !this.priceTouched) this.fillPrice.set('');
    });

    this.marksRequest$.pipe(
      tap(open => this.pricesLoading.set(open.length > 0)),
      switchMap(open => (open.length
        ? forkJoin(open.map(p => this.market.getLatestClose(p.contract))).pipe(
          switchMap(results => of(new Map(open.map((p, i) => [p.contract.key, results[i]] as const)))))
        : of(new Map<string, LatestClose | null>()))),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(marks => {
      this.pricesLoading.set(false);
      this.cmps.set(marks);
    });

    this.chartRequest$.pipe(
      tap(id => {
        this.chartLoading.set(Boolean(id));
        this.chartError.set('');
      }),
      switchMap(id => {
        if (!id) return of(null);
        const fills = this.store.fills();
        const keys = new Set(fills.filter(f => f.basketId === id).map(f => f.contract.key));
        const related = fills.filter(f => keys.has(f.contract.key));
        if (!related.length) return of({ rows: [], unpriced: [] });
        const contracts = [...new Map(related.map(f => [f.contract.key, f.contract])).values()];
        const from = related.map(f => f.date).sort()[0];
        return this.market.getCloseHistory(contracts, from, this.today).pipe(
          switchMap(history => of(buildBasketEodSeries(id, fills, history))),
          catchError(() => {
            this.chartError.set('Unable to load EOD prices for this basket. Please try again.');
            return of(null);
          }),
        );
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(result => {
      this.chartLoading.set(false);
      this.basketEod.set(result);
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
