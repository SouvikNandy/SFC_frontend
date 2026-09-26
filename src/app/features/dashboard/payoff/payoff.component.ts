import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  TemplateRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { EMPTY, Observable, Subject, catchError, finalize, forkJoin, map, merge, of, switchMap, takeUntil, tap, throwError } from 'rxjs';
import { ToastService } from '../../../core/services/toast.service';
import { ChartTooltipComponent, ChartTooltipRow } from '../../../shared/components/chart-tooltip/chart-tooltip.component';
import { DataTableComponent } from '../../../shared/components/data-table/data-table.component';
import {
  DataTableAction,
  DataTableActionEvent,
  DataTableCellContext,
  DataTableColumn,
} from '../../../shared/components/data-table/data-table.types';
import { DefaultStock } from '../../../shared/services/constantFile';
import { addDays, computePayoff, theoreticalPremium } from './payoff-engine';
import { buildPayoffChart, buildStrikeLadder, formatRupee } from './payoff-chart.util';
import {
  STRATEGY_GROUPS,
  STRATEGY_NAMES,
  StrategyContext,
  buildStrategy,
  defaultStrikeStep,
  deriveStrikeStep,
  nearAndNextExpiry,
} from './payoff-strategies';
import {
  ExpiryQuotes,
  HeatCell,
  HeatColumn,
  HeatRow,
  OptionType,
  PayoffExpiry,
  PayoffLeg,
  PayoffMode,
  PayoffResult,
  PayoffStrategy,
  PayoffSymbolDetails,
  PayoffView,
  PricedLeg,
} from './payoff.model';
import { PayoffService } from './payoff.service';
import { ActivatedRoute } from '@angular/router';
import { LiveDataAccessComponent } from '../live-data/live-data-access.component';
import { LiveDataAccessService } from '../live-data/live-data-access.service';

type LegCell = TemplateRef<DataTableCellContext<PayoffLeg>>;
type HeatCellTemplate = TemplateRef<DataTableCellContext<HeatRow>>;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const NARROW_QUERY = '(max-width: 640px)';

const isPricedLeg = (leg: PayoffLeg): leg is PricedLeg => leg.premium !== null;
const EMPTY_QUOTES: Omit<ExpiryQuotes, 'status'> = { byStrike: new Map(), callStrikes: [], putStrikes: [] };

/** Market-data problems that are reported to the user as-is (not generic API failures). */
class MarketDataError extends Error { }
const formatDay = (date: Date) => `${date.getDate()} ${MONTHS[date.getMonth()]}`;
const formatMoney = (value: number) =>
  (value < 0 ? '-₹' : '₹') + Math.abs(value).toLocaleString('en-IN', { maximumFractionDigits: 0 });

@Component({
  selector: 'app-payoff',
  standalone: true,
  imports: [ReactiveFormsModule, DataTableComponent, ChartTooltipComponent, LiveDataAccessComponent],
  templateUrl: './payoff.component.html',
  styleUrl: './payoff.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PayoffComponent implements OnInit {
  private readonly payoff = inject(PayoffService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly liveAccess = inject(LiveDataAccessService);
  private readonly symbolSelection$ = new Subject<string>();
  /** Fires on every symbol change so expiry-quote requests for the previous symbol are dropped. */
  private readonly quoteReset$ = new Subject<void>();
  private legId = 0;
  private symbolsRequested = false;

  readonly strategyGroups = STRATEGY_GROUPS;
  readonly formatMoney = formatMoney;
  readonly formatRupee = formatRupee;
  readonly symbolControl = new FormControl('', { nonNullable: true });

  /* ---------- symbol autocomplete ---------- */
  readonly symbols = signal<string[]>([]);
  readonly filteredSymbols = signal<string[]>([]);
  readonly symbolsLoading = signal(true);
  readonly suggestionsOpen = signal(false);
  readonly highlightedSymbolIndex = signal(-1);
  readonly selectedSymbol = signal('');

  /* ---------- market data (EOD) ---------- */
  readonly marketLoading = signal(false);
  readonly marketError = signal('');
  readonly details = signal<PayoffSymbolDetails | null>(null);
  readonly expiries = signal<PayoffExpiry[]>([]);
  /** EOD prices keyed by expiryDays: the real counterpart of the prototype's chainPremium(type, K, days). */
  readonly quotes = signal<ReadonlyMap<number, ExpiryQuotes>>(new Map());
  readonly volUnavailable = signal(false);
  readonly lotFromFeed = signal(false);

  /* ---------- position and controls ---------- */
  readonly mode = signal<PayoffMode>('eod');
  readonly strategy = signal<PayoffStrategy>('double_calendar');
  readonly spot = signal(Number.NaN);
  readonly vol = signal(Number.NaN);
  readonly lotSize = signal(Number.NaN);
  readonly legs = signal<PayoffLeg[]>([]);
  readonly evalDay = signal(30);
  readonly rangePct = signal(6);
  readonly ivMultiplier = signal(100);
  readonly view = signal<PayoffView>('graph');
  readonly narrow = signal(typeof window !== 'undefined' && window.matchMedia(NARROW_QUERY).matches);
  readonly hover = signal<{ index: number; left: number; top: number } | null>(null);

  /* ---------- table cell templates ---------- */
  private readonly typeCell = viewChild.required<LegCell>('typeCell');
  private readonly directionCell = viewChild.required<LegCell>('directionCell');
  private readonly strikeCell = viewChild.required<LegCell>('strikeCell');
  private readonly premiumCell = viewChild.required<LegCell>('premiumCell');
  private readonly quantityCell = viewChild.required<LegCell>('quantityCell');
  private readonly expiryCell = viewChild.required<LegCell>('expiryCell');
  private readonly heatPriceCell = viewChild.required<HeatCellTemplate>('heatPriceCell');
  private readonly heatValueCell = viewChild.required<HeatCellTemplate>('heatValueCell');

  readonly legTrackBy = (_index: number, leg: PayoffLeg) => leg.id;
  readonly legActions: DataTableAction<PayoffLeg>[] = [
    { id: 'remove', label: 'Remove', icon: '×', variant: 'danger' },
  ];

  /* ---------- derived market data ---------- */
  /** Instrument strike spacing from the nearest loaded expiry; the prototype uses it in every mode. */
  readonly strikeStep = computed(() => {
    const spot = this.spot();
    const listed = this.expiries().map(expiry => this.quotes().get(expiry.days)).find(quotes => quotes?.status === 'ready');
    if (listed?.byStrike.size) return deriveStrikeStep([...listed.byStrike.keys()], spot);
    return spot > 0 ? defaultStrikeStep(spot) : 1;
  });
  readonly baseDate = computed(() => this.parseLocalDate(this.details()?.trade_date) ?? this.today());
  /** EOD legs whose expiry prices are still being fetched. */
  readonly quotesLoading = computed(() =>
    this.mode() === 'eod' && this.legs().some(leg => this.quotes().get(leg.expiryDays)?.status === 'loading'));
  readonly effVol = computed(() => this.vol() * (this.ivMultiplier() / 100));
  /** EOD pre-fills HV-20 but lets the user override it; the hint keeps the feed value visible. */
  readonly volHint = computed(() => {
    if (this.mode() === 'custom') return 'Entered manually';
    const hv = this.details()?.hv20;
    if (this.volUnavailable() || typeof hv !== 'number') return 'HV-20 unavailable, enter manually';
    const feed = Math.round(hv * 100) / 100;
    return this.vol() === feed ? 'HV-20 from BhavCopy EOD · editable' : `Edited · HV-20 from BhavCopy EOD is ${feed}%`;
  });

  /* ---------- validation → single calculation → views ---------- */
  readonly validationError = computed(() => this.validate());

  readonly result = computed<PayoffResult | null>(() => {
    if (this.mode() === 'live' || this.marketLoading() || this.quotesLoading() || this.validationError()) return null;
    const legs = this.legs();
    if (!legs.length || !legs.every(isPricedLeg)) return null;
    return computePayoff({
      legs,
      spot: this.spot(),
      vol: this.vol(),
      ivMultiplier: this.ivMultiplier(),
      rangePct: this.rangePct(),
      evalDay: this.evalDay(),
      baseDate: this.baseDate(),
      narrow: this.narrow(),
    });
  });

  readonly chart = computed(() => {
    const result = this.result();
    return result && this.view() === 'graph' ? buildPayoffChart(result, this.legs(), this.spot(), this.narrow()) : null;
  });

  readonly ladder = computed(() => {
    const result = this.result();
    return result ? buildStrikeLadder(result, this.legs(), this.spot(), this.strikeStep(), this.baseDate(), this.narrow()) : null;
  });

  readonly heatColumns = computed<DataTableColumn<HeatRow>[]>(() => {
    const result = this.result();
    if (!result) return [];
    return [
      { key: 'price', label: 'Price', template: this.heatPriceCell() },
      ...result.heatmap.columns.map((column, index) => ({
        key: `d${index}`,
        label: this.heatLabel(column),
        value: (row: HeatRow) => row.cells[index],
        template: this.heatValueCell(),
      })),
    ];
  });
  readonly heatRows = computed(() => this.result()?.heatmap.rows ?? []);

  readonly legColumns = computed<DataTableColumn<PayoffLeg>[]>(() => {
    const mode = this.mode();
    const premiumSource = mode === 'custom' ? '(entered)' : mode === 'live' ? '(live LTP)' : '(BhavCopy settle)';
    return [
      { key: 'type', label: 'Call / Put', template: this.typeCell() },
      { key: 'direction', label: 'Long / Short', template: this.directionCell() },
      { key: 'strike', label: 'Strike', template: this.strikeCell() },
      { key: 'premium', label: `Premium ${premiumSource}`, template: this.premiumCell() },
      { key: 'quantity', label: 'Qty', template: this.quantityCell() },
      { key: 'expiryDays', label: mode === 'custom' ? 'Days to expiry' : 'Expiry (chain dates)', template: this.expiryCell() },
    ];
  });

  /* ---------- labels ---------- */
  readonly strategyName = computed(() => STRATEGY_NAMES[this.strategy()] ?? 'Position');
  readonly tickerLabel = computed(() => (this.mode() === 'custom' ? 'CUSTOM' : this.selectedSymbol() || '–'));
  readonly lastPrice = computed(() => (this.spot() > 0 ? formatRupee(this.spot()) : '–'));
  readonly sourceNote = computed(() => {
    if (this.mode() === 'custom') return 'Manual entry';
    if (this.mode() === 'live') return 'Live feed · Premium';
    const date = this.parseLocalDate(this.details()?.trade_date);
    return date ? `BhavCopy EOD close · ${formatDay(date)} ${date.getFullYear()}` : '';
  });
  readonly evalMax = computed(() => Math.max(this.result()?.near ?? this.evalDay(), 1));
  readonly evalValue = computed(() => this.result()?.evalDay ?? this.evalDay());
  readonly evalLabel = computed(() => {
    const result = this.result();
    if (!result) return '–';
    return result.evalDay >= result.near ? 'At expiration' : `${formatDay(addDays(this.baseDate(), result.evalDay))} · T+${result.evalDay}`;
  });
  readonly dateCaption = computed(() => {
    const result = this.result();
    if (!result) return { left: '', right: '' };
    const date = addDays(this.baseDate(), result.evalDay);
    return {
      left: `DATE: ${WEEKDAYS[date.getDay()]} ${formatDay(date)} (${result.near - result.evalDay}d left)`,
      right: result.evalDay >= result.near ? '(At expiration)' : '(Pre-expiry estimate)',
    };
  });
  readonly ivLabel = computed(() => {
    const multiplier = `×${(this.ivMultiplier() / 100).toFixed(2)}`;
    return Number.isFinite(this.effVol()) ? `${multiplier} → ${this.effVol().toFixed(2)}%` : multiplier;
  });
  readonly expiryPill = computed(() => {
    const used = Array.from(new Set(this.legs().map(leg => leg.expiryDays).filter(days => days > 0))).sort((a, b) => a - b);
    return used.length ? { text: `Expirations: ${used.map(days => `${days}d`).join(', ')}`, calendar: used.length > 1 } : null;
  });
  readonly calendarNote = computed(() => {
    const result = this.result();
    if (!result?.isCalendar) return '';
    const nearLabel = formatDay(addDays(this.baseDate(), result.near));
    const farLabel = formatDay(addDays(this.baseDate(), result.far));
    return `Mixed expiries: the expiration line is drawn at ${nearLabel} (T+${result.near}), where the ${farLabel} leg still holds time value. ` +
      `That residual is priced with Black-Scholes at ${result.effVol.toFixed(2)}% volatility, so this curve moves with the IV slider, unlike a single-expiry position.`;
  });
  readonly summary = computed(() => {
    const result = this.result();
    if (!result) return null;
    const { metrics } = result;
    const nearLabel = `At ${formatDay(addDays(this.baseDate(), result.near))}`;
    const np = metrics.netPremium;
    return {
      premiumWord: np >= 0 ? 'debit' : 'credit',
      premium: formatMoney(Math.abs(np)),
      premiumTone: np > 0 ? 'loss' : np < 0 ? 'profit' : '',
      premiumHint: np > 0 ? 'Paid to open' : np < 0 ? 'Received to open' : 'Zero cost',
      maxProfit: metrics.profitUnlimited ? 'Unlimited' : formatMoney(metrics.maxProfit),
      maxProfitHint: metrics.profitUnlimited ? 'Beyond charted range' : nearLabel,
      maxLoss: metrics.lossUnlimited ? 'Margin dependent' : formatMoney(Math.abs(metrics.maxLoss)),
      maxLossHint: metrics.lossUnlimited ? 'Undefined risk, set by margin' : nearLabel,
      chance: `${metrics.chanceOfProfit.toFixed(0)}%`,
      chanceHint: `${result.effVol.toFixed(1)}% vol · ${result.near}d`,
      zones: metrics.zones.length
        ? metrics.zones.map(([a, b]) => a === -Infinity && b === Infinity ? 'Entire charted range' : a === -Infinity ? `Below ${formatRupee(b)}` : b === Infinity ? `Above ${formatRupee(a)}` : `Between ${formatRupee(a)} – ${formatRupee(b)}`)
        : ['None in range'],
      zonesHint: metrics.zones.length > 1 ? `${metrics.zones.length} profitable bands` : nearLabel,
      nearDays: result.near,
    };
  });
  readonly emptyMessage = computed(() => {
    if (this.mode() === 'live') return 'Live pricing needs the live market feed. Switch to EOD or Custom to price the position.';
    if (this.marketLoading()) return 'Loading payoff data…';
    if (this.quotesLoading()) return 'Loading BhavCopy prices for the selected expiry…';
    return this.validationError() || 'Enter valid inputs to display the payoff.';
  });
  readonly hoverPoint = computed(() => {
    const hover = this.hover(), chart = this.chart();
    const point = hover && chart ? chart.points[hover.index] : undefined;
    return point && hover && chart ? { ...point, left: hover.left, top: hover.top, showEval: chart.evalPath !== null } : null;
  });
  readonly tooltipRows = computed<ChartTooltipRow[]>(() => {
    const point = this.hoverPoint(), result = this.result();
    if (!point || !result) return [];
    const tone = (value: number) => (value >= 0 ? 'call' : 'put');
    const rows: ChartTooltipRow[] = [
      { label: `Expiry ${formatDay(addDays(this.baseDate(), result.near))}`, value: formatMoney(point.pnlExpiry), tone: tone(point.pnlExpiry) },
    ];
    if (point.showEval) {
      rows.push({ label: `T+${result.evalDay} ${formatDay(addDays(this.baseDate(), result.evalDay))}`, value: formatMoney(point.pnlEval), tone: tone(point.pnlEval) });
    }
    const move = (point.price / this.spot() - 1) * 100;
    rows.push({ label: 'vs spot', value: `${move >= 0 ? '+' : ''}${move.toFixed(1)}%`, tone: 'neutral' });
    return rows;
  });
  readonly tooltipTitle = computed(() => {
    const point = this.hoverPoint();
    return point ? `${this.strategyName()} · ${formatRupee(Math.round(point.price))}` : '';
  });

  ngOnInit(): void {
    if (this.liveAccess.requestedLive(this.route.snapshot)) this.mode.set('live');
    this.watchViewport();
    this.setupMarketData();
    // Live Data is a separate view: symbol/EOD APIs load only when EOD or Custom is opened.
    if (this.mode() !== 'live') this.loadSymbols();
  }

  /* ================= data source ================= */

  selectMode(mode: PayoffMode): void {
    if (mode === this.mode()) return;
    this.mode.set(mode);
    this.hover.set(null);
    if (mode === 'live') {
      // Cancel an in-flight EOD request; EOD reloads when its tab is reopened.
      if (this.marketLoading()) this.symbolSelection$.next('');
      return;
    }
    if (!this.symbolsRequested) this.loadSymbols();
    if (mode === 'custom') {
      this.loadStrategy();
    } else if (mode === 'eod') {
      if (this.details() && this.quotes().size) this.applyFeedValues();
      else {
        const symbol = this.selectedSymbol() || (this.symbols().includes(DefaultStock) ? DefaultStock : this.symbols()[0]);
        if (symbol) this.selectSymbol(symbol);
      }
    }
  }

  /* ================= symbol autocomplete ================= */

  onSymbolInput(): void {
    const query = this.symbolControl.value.trim().toLowerCase();
    this.filteredSymbols.set(query ? this.symbols().filter(symbol => symbol.toLowerCase().includes(query)) : this.symbols());
    this.suggestionsOpen.set(true);
    this.highlightedSymbolIndex.set(-1);
  }

  selectSymbol(symbol: string): void {
    if (!this.symbols().includes(symbol)) return;
    this.symbolControl.setValue(symbol, { emitEvent: false });
    this.filteredSymbols.set([]);
    this.suggestionsOpen.set(false);
    this.highlightedSymbolIndex.set(-1);
    this.selectedSymbol.set(symbol);
    this.symbolSelection$.next(symbol);
  }

  clearSymbol(): void {
    this.symbolControl.setValue('', { emitEvent: false });
    this.filteredSymbols.set(this.symbols());
    this.suggestionsOpen.set(false);
    this.highlightedSymbolIndex.set(-1);
    this.selectedSymbol.set('');
    // An empty selection cancels any in-flight request without calling the API.
    this.symbolSelection$.next('');
  }

  onSymbolKeydown(event: KeyboardEvent): void {
    const options = this.filteredSymbols();
    if (!this.suggestionsOpen() || !options.length) {
      if (event.key === 'ArrowDown') this.onSymbolInput();
      return;
    }
    const current = this.highlightedSymbolIndex();
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.highlightedSymbolIndex.set((current + 1) % options.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.highlightedSymbolIndex.set(current <= 0 ? options.length - 1 : current - 1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      this.selectSymbol(options[current >= 0 ? current : 0]);
    } else if (event.key === 'Escape') {
      this.suggestionsOpen.set(false);
    }
  }

  onSymbolBlur(): void {
    window.setTimeout(() => {
      this.suggestionsOpen.set(false);
      // Typed text that is not a listed symbol reverts to the active selection.
      if (this.symbolControl.value !== this.selectedSymbol()) this.symbolControl.setValue(this.selectedSymbol(), { emitEvent: false });
    }, 150);
  }

  /* ================= position inputs ================= */

  onStrategyChange(value: string): void {
    this.strategy.set(value as PayoffStrategy);
    this.loadStrategy();
  }

  onSpotInput(raw: string): void {
    this.spot.set(parseFloat(raw));
    this.rebuildIfIncomplete();
  }

  onVolInput(raw: string): void {
    this.vol.set(parseFloat(raw));
    this.rebuildIfIncomplete();
  }

  onLotInput(raw: string): void {
    const lot = parseInt(raw, 10);
    this.lotSize.set(lot);
    this.legs.update(legs => legs.map(leg => ({ ...leg, lotSize: lot || 1 })));
  }

  onEvalInput(raw: string): void { this.evalDay.set(Number(raw)); }
  onRangeInput(raw: string): void { this.rangePct.set(Number(raw)); }
  onIvInput(raw: string): void { this.ivMultiplier.set(Number(raw)); }

  setView(view: PayoffView): void {
    this.view.set(view);
    this.hover.set(null);
  }

  /* ================= legs ================= */

  onLegType(id: number, value: string): void {
    this.patchLeg(id, { type: value === 'put' ? 'put' : 'call' }, true);
  }

  onLegDirection(id: number, value: string): void {
    this.patchLeg(id, { direction: value === 'short' ? 'short' : 'long' }, false);
  }

  onLegStrike(id: number, raw: string): void {
    this.patchLeg(id, { strike: parseFloat(raw) }, true);
  }

  onLegPremium(id: number, raw: string): void {
    const premium = parseFloat(raw);
    this.patchLeg(id, { premium: Number.isFinite(premium) ? premium : null }, false);
  }

  onLegQuantity(id: number, raw: string): void {
    this.patchLeg(id, { quantity: parseFloat(raw) }, false);
  }

  onLegExpiry(id: number, raw: string): void {
    this.patchLeg(id, { expiryDays: parseFloat(raw) }, true);
  }

  onLegAction(event: DataTableActionEvent<PayoffLeg>): void {
    if (event.action.id !== 'remove') return;
    this.commitLegs(this.legs().filter(leg => leg.id !== event.row.id));
    this.strategy.set('custom_position');
  }

  addLeg(): void {
    const spot = this.spot(), step = this.strikeStep();
    const expiryDays = nearAndNextExpiry(this.expiryDays()).near;
    const strike = this.resolveStrike(Math.round(spot / step) * step, 'call', expiryDays);
    const lotSize = this.lotSize() > 0 ? this.lotSize() : 1;
    this.commitLegs([...this.legs(), {
      id: ++this.legId, type: 'call', direction: 'long', strike,
      premium: this.premiumFor('call', strike, expiryDays), quantity: 1, expiryDays, lotSize,
    }]);
    this.strategy.set('custom_position');
  }

  /** Custom mode only: recompute Black-Scholes premiums at the current volatility. EOD premiums always track the loaded settlements. */
  reprice(): void {
    this.legs.update(legs => legs.map(leg => ({ ...leg, premium: this.premiumFor(leg.type, leg.strike, leg.expiryDays) })));
  }

  /** Strikes quoted for this leg's option type on this leg's expiry. */
  strikeOptions(leg: PayoffLeg): number[] {
    const quotes = this.quotes().get(leg.expiryDays);
    return quotes?.status === 'ready' ? (leg.type === 'call' ? quotes.callStrikes : quotes.putStrikes) : [];
  }

  hasListedStrike(leg: PayoffLeg): boolean {
    return this.quoteFor(leg.type, leg.strike, leg.expiryDays) !== null;
  }

  hasListedExpiry(leg: PayoffLeg): boolean {
    return this.expiries().some(expiry => expiry.days === leg.expiryDays);
  }

  expiryOptionLabel(days: number): string {
    return `${formatDay(addDays(this.baseDate(), days))} · ${days}d`;
  }

  displayNumber(value: number | null): string {
    return value !== null && Number.isFinite(value) ? String(value) : '';
  }

  /* ================= chart hover ================= */

  onChartPointer(event: MouseEvent | TouchEvent): void {
    const chart = this.chart();
    const svg = (event.currentTarget as SVGGraphicsElement | null)?.ownerSVGElement;
    const wrap = svg?.parentElement;
    if (!chart || !svg || !wrap) return;
    const clientX = 'touches' in event ? event.touches[0]?.clientX : event.clientX;
    const clientY = 'touches' in event ? event.touches[0]?.clientY : event.clientY;
    const bounds = svg.getBoundingClientRect();
    if (clientX == null || clientY == null || !bounds.width) return;
    const svgX = ((clientX - bounds.left) / bounds.width) * chart.width;
    const ratio = Math.max(0, Math.min(1, (svgX - chart.padLeft) / chart.plotWidth));
    const index = Math.round(ratio * (chart.points.length - 1));
    const container = wrap.getBoundingClientRect();
    this.hover.set({
      index,
      left: Math.max(8, Math.min(container.width - 182, clientX - container.left + 12)),
      top: Math.max(8, clientY - container.top - 96),
    });
  }

  hideChartTooltip(): void {
    this.hover.set(null);
  }

  /* ================= heat map helpers ================= */

  heatClass(cell: HeatCell): string {
    return `heat-cell heat-${cell.positive ? 'pos' : 'neg'}-${cell.level}${cell.strong ? ' heat-strong' : ''}`;
  }

  movePct(row: HeatRow): string {
    return `${row.movePct >= 0 ? '+' : ''}${row.movePct.toFixed(1)}%`;
  }

  /* ================= internals ================= */

  private loadSymbols(): void {
    this.symbolsRequested = true;
    this.payoff.getSymbols().pipe(
      catchError(() => {
        this.toast.error('Unable to load symbols. Please refresh and try again.');
        return EMPTY;
      }),
      finalize(() => this.symbolsLoading.set(false)),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(symbols => {
      this.symbols.set(symbols);
      this.filteredSymbols.set(symbols);
      const initial = symbols.includes(DefaultStock) ? DefaultStock : symbols[0];
      if (initial && this.mode() === 'eod') this.selectSymbol(initial);
    });
  }

  /**
   * symbol → symbol details (spot, expiries, lot, HV-20) → prices for the preset near/far expiries.
   * switchMap drops responses for superseded selections, so a slow request can never overwrite a newer symbol.
   */
  private setupMarketData(): void {
    this.symbolSelection$.pipe(
      tap(symbol => {
        this.resetMarketData();
        this.marketLoading.set(Boolean(symbol));
      }),
      switchMap(symbol => symbol
        ? this.payoff.getSymbolDetails(symbol).pipe(
          switchMap(details => this.loadInitialQuotes(symbol, details)),
          catchError((error: unknown) => {
            this.marketLoading.set(false);
            this.failMarketData(error instanceof MarketDataError ? error.message : `Unable to load payoff data for ${symbol}. Please try again.`);
            return EMPTY;
          }),
        )
        : EMPTY),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(({ symbol, details, expiries, quotes }) => {
      this.marketLoading.set(false);
      if (symbol !== this.selectedSymbol()) return;
      this.details.set(details);
      this.expiries.set(expiries);
      this.quotes.set(quotes);
      if (this.mode() === 'eod') this.applyFeedValues();
    });
  }

  /** Presets use the nearest listed expiry and the next one, so both are priced before the legs are built. */
  private loadInitialQuotes(symbol: string, details: PayoffSymbolDetails): Observable<{
    symbol: string; details: PayoffSymbolDetails; expiries: PayoffExpiry[]; quotes: Map<number, ExpiryQuotes>;
  }> {
    if (!(typeof details.underlying === 'number' && details.underlying > 0)) {
      return throwError(() => new MarketDataError(`Underlying price is not available for ${symbol}.`));
    }
    const expiries = this.parseExpiries(details.expiry_date, this.parseLocalDate(details.trade_date) ?? this.today());
    if (!expiries.length) return throwError(() => new MarketDataError(`No upcoming expiries are available for ${symbol}.`));
    const days = expiries.map(expiry => expiry.days);
    const { near, next } = nearAndNextExpiry(days);
    const wanted = expiries.filter(expiry => expiry.days === near || expiry.days === next);
    return forkJoin(wanted.map(expiry => this.payoff.getExpiryQuotes(symbol, expiry.iso).pipe(
      map(quotes => [expiry.days, quotes] as const)))).pipe(
      map(entries => {
        if (entries.every(([, quotes]) => !quotes.byStrike.size)) {
          throw new MarketDataError(`No BhavCopy option prices are available for ${symbol}.`);
        }
        return { symbol, details, expiries, quotes: new Map(entries) };
      }),
    );
  }

  /** Loads prices for any expiry a leg uses that is not cached yet, then re-quotes the legs. */
  private ensureQuotes(days: number[]): void {
    const symbol = this.selectedSymbol();
    const cache = this.quotes();
    const missing = this.expiries().filter(expiry => days.includes(expiry.days) && !cache.has(expiry.days));
    if (!symbol || !missing.length) return;
    const next = new Map(cache);
    missing.forEach(expiry => next.set(expiry.days, { status: 'loading', ...EMPTY_QUOTES }));
    this.quotes.set(next);
    merge(...missing.map(expiry => this.payoff.getExpiryQuotes(symbol, expiry.iso).pipe(
      map(quotes => ({ expiry, quotes })),
      catchError(() => of({ expiry, quotes: { status: 'error' as const, ...EMPTY_QUOTES } })),
    ))).pipe(takeUntil(this.quoteReset$), takeUntilDestroyed(this.destroyRef)).subscribe(({ expiry, quotes }) => {
      if (symbol !== this.selectedSymbol()) return;
      this.quotes.update(current => new Map(current).set(expiry.days, quotes));
      if (quotes.status === 'error') this.toast.error(`Unable to load BhavCopy prices for ${symbol} ${formatDay(expiry.date)} expiry.`);
      this.refreshPremiums();
    });
  }

  /** Prototype refreshPremiums(): outside Custom, every leg is re-quoted for its own type, strike and expiry. */
  private refreshPremiums(): void {
    if (this.mode() === 'custom') return;
    this.ensureQuotes(this.legs().map(leg => leg.expiryDays));
    this.legs.update(legs => legs.map(leg => ({ ...leg, premium: this.quoteFor(leg.type, leg.strike, leg.expiryDays) })));
  }

  private quoteFor(type: OptionType, strike: number, days: number): number | null {
    const quotes = this.quotes().get(days);
    if (quotes?.status !== 'ready') return null;
    const quote = quotes.byStrike.get(strike);
    return (type === 'call' ? quote?.ce : quote?.pe) ?? null;
  }

  private resetMarketData(): void {
    this.quoteReset$.next();
    this.details.set(null);
    this.quotes.set(new Map());
    this.expiries.set([]);
    this.marketError.set('');
    this.volUnavailable.set(false);
    this.lotFromFeed.set(false);
    this.hover.set(null);
    if (this.mode() !== 'custom') {
      this.legs.set([]);
      this.spot.set(Number.NaN);
      this.vol.set(Number.NaN);
      this.lotSize.set(Number.NaN);
    }
  }

  private failMarketData(message: string): void {
    this.marketError.set(message);
    this.toast.error(message);
  }

  /** EOD: underlying, HV-20 and lot size come from the feed, then the strategy is rebuilt (prototype: loadInstrument). */
  private applyFeedValues(): void {
    const details = this.details();
    if (!details) return;
    const hv = details.hv20;
    const hvValid = typeof hv === 'number' && Number.isFinite(hv) && hv > 0;
    const lot = details.lot;
    const lotValid = typeof lot === 'number' && Number.isInteger(lot) && lot > 0;
    this.spot.set(Math.round(details.underlying * 100) / 100);
    this.vol.set(hvValid ? Math.round(hv * 100) / 100 : Number.NaN);
    this.volUnavailable.set(!hvValid);
    this.lotFromFeed.set(lotValid);
    if (lotValid) this.lotSize.set(lot);
    this.loadStrategy();
  }

  /** Prototype loadStrategy(): build the preset legs, re-quote them (EOD), then put the date slider at the nearest expiry. */
  private loadStrategy(): void {
    const legs = buildStrategy(this.strategy(), this.strategyContext());
    this.commitLegs(legs);
    this.refreshPremiums();
    const near = this.nearestExpiry(legs);
    if (near !== null) this.evalDay.set(near);
  }

  private strategyContext(): StrategyContext {
    return {
      spot: this.spot(),
      step: this.strikeStep(),
      lotSize: this.lotSize() > 0 ? this.lotSize() : 1,
      sigma: this.effVol() / 100,
      expiries: this.expiryDays(),
      existing: this.legs(),
      premium: (type, strike, days) => this.premiumFor(type, strike, days),
      strike: (target, type, days) => this.resolveStrike(target, type, days),
      nextId: () => ++this.legId,
    };
  }

  /** Custom prices from Black-Scholes (prototype pr()/Reprice); EOD reads that expiry's CE (call) / PE (put) price. */
  private premiumFor(type: OptionType, strike: number, days: number): number | null {
    if (this.mode() === 'custom') {
      const premium = theoreticalPremium(type, this.spot(), strike, days, this.effVol() / 100);
      return Number.isFinite(premium) ? premium : null;
    }
    return this.quoteFor(type, strike, days);
  }

  /** EOD strikes must exist on that expiry's chain: snap to the nearest strike quoted for this side. */
  private resolveStrike(target: number, type: OptionType, days: number): number {
    if (this.mode() === 'custom' || !Number.isFinite(target)) return target;
    const quotes = this.quotes().get(days);
    const listed = quotes?.status === 'ready' ? (type === 'call' ? quotes.callStrikes : quotes.putStrikes) : [];
    if (!listed.length) return target;
    return listed.reduce((best, strike) => (Math.abs(strike - target) < Math.abs(best - target) ? strike : best), listed[0]);
  }

  /** Listed expiries in days; like the prototype's EXPIRIES they also drive Custom-mode presets when known. */
  private expiryDays(): number[] {
    return this.expiries().map(expiry => expiry.days);
  }

  /** Prototype leg input handler: a new type/strike/expiry is a different contract, so EOD re-quotes every leg. */
  private patchLeg(id: number, patch: Partial<PayoffLeg>, requote: boolean): void {
    this.commitLegs(this.legs().map(leg => (leg.id === id ? { ...leg, ...patch } : leg)));
    if (requote) this.refreshPremiums();
  }

  /** Clamps the evaluation date to the nearest expiry, as the prototype's slider does. */
  private commitLegs(legs: PayoffLeg[]): void {
    this.legs.set(legs);
    const near = this.nearestExpiry(legs);
    if (near !== null && this.evalDay() > Math.max(near, 1)) this.evalDay.set(Math.max(near, 1));
  }

  private rebuildIfIncomplete(): void {
    if (this.mode() !== 'custom' || !(this.spot() > 0)) return;
    if (!this.legs().length || this.legs().some(leg => !Number.isFinite(leg.strike))) this.loadStrategy();
  }

  private nearestExpiry(legs: PayoffLeg[]): number | null {
    const days = legs.map(leg => leg.expiryDays).filter(value => Number.isFinite(value) && value > 0);
    return days.length ? Math.min(...days) : null;
  }

  private validate(): string {
    const mode = this.mode();
    if (mode === 'live') return '';
    if (mode === 'eod') {
      if (!this.selectedSymbol()) return 'Select an instrument to load strike and settlement data.';
      if (this.marketLoading() || this.quotesLoading()) return '';
      if (this.marketError()) return this.marketError();
    }
    const legs = this.legs(), vol = this.vol(), lot = this.lotSize();
    if (!legs.length) return 'Add at least one leg to the position.';
    if (!(this.spot() > 0)) return 'Underlying price must be greater than 0.';
    if (!(vol > 0)) {
      return this.volUnavailable() && mode === 'eod'
        ? `HV-20 volatility is not available for ${this.selectedSymbol()}. Enter a base volatility to continue.`
        : 'Volatility must be greater than 0%.';
    }
    if (!(lot > 0)) return 'Lot size must be at least 1.';
    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i], n = i + 1;
      if (!(leg.strike > 0)) return `Leg ${n}: strike must be greater than 0.`;
      if (leg.premium === null) {
        if (mode === 'custom') return `Leg ${n}: enter a premium.`;
        const expiry = formatDay(addDays(this.baseDate(), leg.expiryDays));
        if (!this.hasListedExpiry(leg)) return `Leg ${n}: ${expiry} is not a listed expiry. Choose one of the chain dates.`;
        return this.quotes().get(leg.expiryDays)?.status === 'error'
          ? `Leg ${n}: BhavCopy prices for the ${expiry} expiry could not be loaded.`
          : `Leg ${n}: no ${leg.type === 'call' ? 'CE' : 'PE'} BhavCopy price for strike ${leg.strike} on the ${expiry} expiry.`;
      }
      if (!(leg.premium >= 0)) return `Leg ${n}: premium cannot be negative.`;
      if (!(leg.quantity > 0)) return `Leg ${n}: quantity must be at least 1.`;
      if (!(leg.expiryDays > 0)) return `Leg ${n}: expiry must be in the future.`;
    }
    return '';
  }

  private heatLabel(column: HeatColumn): string {
    const label = `${WEEKDAYS[column.date.getDay()]} ${formatDay(column.date)}`;
    return column.isExpiry ? `${label} · Exp` : label;
  }

  private parseExpiries(raw: PayoffSymbolDetails['expiry_date'], base: Date): PayoffExpiry[] {
    const values = Array.isArray(raw) ? raw : [raw];
    const byDays = new Map<number, PayoffExpiry>();
    values.forEach(value => {
      const date = typeof value === 'number' ? addDays(base, value) : this.parseLocalDate(value);
      if (!date) return;
      const days = Math.round((date.getTime() - base.getTime()) / 86400000);
      if (days > 0 && !byDays.has(days)) byDays.set(days, { days, date, iso: this.isoDate(date) });
    });
    return [...byDays.values()].sort((a, b) => a.days - b.days);
  }

  private isoDate(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  private parseLocalDate(value: string | null | undefined): Date | null {
    const match = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value) : null;
    return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
  }

  private today(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  private watchViewport(): void {
    if (typeof window === 'undefined') return;
    const query = window.matchMedia(NARROW_QUERY);
    const listener = (event: MediaQueryListEvent) => this.narrow.set(event.matches);
    query.addEventListener('change', listener);
    this.destroyRef.onDestroy(() => query.removeEventListener('change', listener));
  }
}
