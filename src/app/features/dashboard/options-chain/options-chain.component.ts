import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EMPTY, Subject, Subscription, catchError, combineLatest, finalize, of, switchMap, takeUntil, tap } from 'rxjs';
import { ToastService } from '../../../core/services/toast.service';
import { GreeksCalculatorService } from '../greeks/greeks-calculator.service';
import { GreeksSymbolDetails } from '../greeks/greeks.model';
import { DefaultStock } from '../../../shared/services/constantFile';
import { formatDisplayDate } from '../../../shared/utils/date-format';
import { CLOSE_EOD_LABEL } from '../../../shared/utils/price-labels';
import { daysToExpiry, expiryNote } from '../../../shared/utils/expiry';
import { contractGreeks } from '../../../shared/pricing/contract-greeks';
import { PricingContext, PricingContextService, describePricingFailure } from '../../../shared/pricing/pricing-context.service';
import { computeMaxPain } from './max-pain.util';
import { OptionsChainService } from './options-chain.service';
import { ActivatedRoute } from '@angular/router';
import { LiveDataAccessComponent } from '../live-data/live-data-access.component';
import { LiveDataAccessService } from '../live-data/live-data-access.service';
import { OptionsChainRow, OptionsChainSide, OptionsChainViewModel } from './models/chain.model';
import {
  ChartTooltipComponent,
  ChartTooltipRow,
} from '../../../shared/components/chart-tooltip/chart-tooltip.component';

type Side = 'call' | 'put';
type ColumnKey = 'oi' | 'oiChange' | 'volume' | 'iv' | 'ltp' | 'delta' | 'gamma' | 'theta' | 'vega';
type MoneyFilter = 'all' | 'call' | 'put';
type SortKey = ColumnKey | 'strike';
type ChartKind = 'oi' | 'oiChange';

interface ChartPointCoordinate {
  index: number;
  x: number;
  y: number;
}

interface ChartBarCoordinate {
  index: number;
  x: number;
  callY: number;
  putY: number;
  callHeight: number;
  putHeight: number;
  width: number;
}

interface ChartTooltipState {
  kind: ChartKind;
  index: number;
  x: number;
  y: number;
  left: number;
  top: number;
  strike: number;
  call: number;
  put: number;
}

@Component({
  selector: 'app-options-chain',
  standalone: true,
  imports: [CommonModule, FormsModule, ChartTooltipComponent, LiveDataAccessComponent],
  template: ` <section class="sfc-page-pad options-chain-page">
    <div class="titlebar">
      <h1>Options Chain</h1>
      @if (!live) {
      <span class="ticker">{{ symbol || '–' }}</span
      ><span class="lastpx">{{ spot === null ? '–' : formatPrice(spot) }}</span
      ><span class="srcnote">{{ sourceNote }}</span>
      }
    </div>
    <p class="sub">
      Full call and put ladder with open interest, volume and Close (EOD) prices. IV and Greeks are solved from each
      contract's own Close (EOD), call and put separately.
    </p>
    <div class="panel">
      <p class="sect-label">Data source</p>
      <div class="source-tabs" role="tablist" aria-label="Data source">
        <button
          type="button"
          [class.active]="!live"
          [attr.aria-selected]="!live"
          (click)="setLive(false)"
        >
          EOD data <em>from BhavCopy</em></button
        ><button
          type="button"
          [class.active]="live"
          [attr.aria-selected]="live"
          (click)="setLive(true)"
        >
          Live data <em>Premium</em>
        </button>
      </div>
      @if (live) {
        <app-live-data-access description="LTP, open interest and volume with intraday OI change"></app-live-data-access>
      } @else {
      <div class="topgrid">
        <div class="field-block autocomplete-field">
          <label for="chain-symbol">Script</label
          ><input
            id="chain-symbol"
            [(ngModel)]="symbol"
            autocomplete="off"
            placeholder="Search scripts…"
            [disabled]="symbolsLoading || detailsLoading"
            role="combobox"
            [attr.aria-expanded]="suggestionsOpen"
            (input)="filterSymbols()"
            (focus)="filterSymbols()"
            (blur)="closeSuggestions()"
            (keydown)="onSymbolKeydown($event)"
          />
          @if (symbol) {
            <button
              class="autocomplete-clear"
              type="button"
              aria-label="Clear selection"
              (mousedown)="$event.preventDefault()"
              (click)="clearSymbol()"
            >
              ×
            </button>
          }
          @if (suggestionsOpen) {
            <div class="autocomplete-options" role="listbox">
              @for (option of filteredSymbols; track option; let i = $index) {
                <button
                  type="button"
                  role="option"
                  [class.highlighted]="i === highlightedIndex"
                  (mousedown)="$event.preventDefault()"
                  (click)="selectSymbol(option)"
                >
                  {{ option }}
                </button>
              } @empty {
                <div class="combo-empty">No script matches</div>
              }
            </div>
          }
        </div>
        <div class="field-block">
          <label for="chain-expiry">Expiry</label
          ><select
            id="chain-expiry"
            [(ngModel)]="expiry"
            [disabled]="!expiryOptions.length || detailsLoading"
            (ngModelChange)="loadChain()"
          >
            @for (option of expiryOptions; track option) {
              <option [ngValue]="option">{{ formatExpiry(option) }}</option>
            }
          </select>
          @if (expiry) {
            <span class="expiry-note">{{ expiryDisplayNote }}</span>
          }
        </div>
        <div class="field-block">
          <label>Underlying price</label><input type="number" [ngModel]="spot" readonly />
        </div>
        <div class="field-block">
          <label>IV underlying</label><input type="number" [ngModel]="ivUnderlying" readonly />
          <span class="expiry-note">{{ ivBasisNote }}</span>
        </div>
        <div class="field-block">
          <label for="strike-search">Search strike</label
          ><input id="strike-search" [(ngModel)]="strikeSearch" placeholder="e.g. 24800" />
        </div>
      </div>
      }
    </div>
    @if (!live) {
    <div class="panel filters-panel" (document:click)="closeColumnsMenu()">
      <div class="filter-toolbar">
        <div class="filter-heading">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
          <span>Filters</span>
        </div>
        <div class="filter-group">
          <div class="filter-group-label">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14M8 12h8M11 19h2" /></svg>
            <span>Strikes</span>
          </div>
          <div class="segmented-control">
            @for (item of strikeFilters; track item.value) {
              <button
                class="segment"
                type="button"
                [class.active]="strikeFilter === item.value"
                (click)="strikeFilter = item.value"
              >
                {{ strikeLabel(item.value) }}
              </button>
            }
          </div>
        </div>
        <div class="filter-group">
          <div class="filter-group-label">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 7h14M5 12h10M5 17h6" />
              <circle cx="17" cy="12" r="2" />
            </svg>
            <span>Moneyness</span>
          </div>
          <div class="segmented-control">
            @for (item of moneyFilters; track item.value) {
              <button
                class="segment"
                type="button"
                [class.active]="moneyFilter === item.value"
                (click)="moneyFilter = item.value"
              >
                {{ moneyLabel(item.value) }}
              </button>
            }
          </div>
        </div>
        <div class="filter-group columns-group">
          <div class="filter-group-label">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="4" y="4" width="6" height="6" rx="1" />
              <rect x="14" y="4" width="6" height="6" rx="1" />
              <rect x="4" y="14" width="6" height="6" rx="1" />
              <rect x="14" y="14" width="6" height="6" rx="1" />
            </svg>
            <span>Columns</span>
          </div>
          <button
            class="columns-trigger"
            type="button"
            aria-haspopup="dialog"
            [attr.aria-expanded]="columnsMenuOpen"
            (click)="$event.stopPropagation(); columnsMenuOpen = !columnsMenuOpen"
          >
            {{ visibleColumnCount }} selected
            <span class="chevron" aria-hidden="true">⌄</span>
          </button>
          @if (columnsMenuOpen) {
            <div
              class="columns-menu"
              role="dialog"
              aria-label="Visible columns"
              (click)="$event.stopPropagation()"
            >
              <div class="columns-menu-list">
                @for (item of columnOptions; track item.key) {
                  <label class="column-option">
                    <input
                      type="checkbox"
                      [checked]="columns[item.key]"
                      [disabled]="columns[item.key] && visibleColumnCount === 1"
                      (change)="toggleColumn(item.key)"
                    />
                    <span>{{ item.label }}</span>
                  </label>
                }
              </div>
            </div>
          }
        </div>
      </div>
    </div>
    <div class="stat-strip">
      <div class="sitem">
        <div class="lab">Total call OI</div>
        <div class="num call-value">{{ integer(summary.call) }}</div>
      </div>
      <div class="sitem">
        <div class="lab">Total put OI</div>
        <div class="num put-value">{{ integer(summary.put) }}</div>
      </div>
      <div class="sitem">
        <div class="lab">PCR (OI)</div>
        <div class="num">{{ decimal(summary.pcr) }}</div>
      </div>
      <div class="sitem">
        <div class="lab">Max pain</div>
        <div class="num">{{ integer(maxPain) }}</div>
      </div>
      <div class="sitem" [attr.title]="highestPutOiTooltip">
        <div class="lab">Highest Put OI</div>
        <div class="num call-value">{{ integer(highestOiStrikes.put) }}</div>
      </div>
      <div class="sitem" [attr.title]="highestCallOiTooltip">
        <div class="lab">Highest Call OI</div>
        <div class="num put-value">{{ integer(highestOiStrikes.call) }}</div>
      </div>
    </div>
    <div class="panel chain-panel">
      <div class="side-tabs">
        <button class="chip" type="button" [class.active]="side === 'call'" (click)="side = 'call'">
          Calls</button
        ><button class="chip" type="button" [class.active]="side === 'put'" (click)="side = 'put'">
          Puts
        </button>
      </div>
      @if (error) {
        <p class="input-error">{{ error }}</p>
      }
      @if (loading) {
        <div class="empty chain-loading" [style.--chain-rows]="strikeFilter ? strikeFilter * 2 + 1 : 100">
          Loading option chain…
        </div>
      } @else if (!visibleRows.length) {
        <div
          class="empty"
          [class.chain-loading]="symbolsLoading"
          [style.--chain-rows]="strikeFilter ? strikeFilter * 2 + 1 : 100"
        >
          {{
            symbol ? 'No option chain data available.' : 'Select a script to load the option chain.'
          }}
        </div>
      } @else {
        <div class="chain-scroll">
          <table class="chain">
            <thead>
              <tr>
                <th class="grouphdr callhdr" [attr.colspan]="activeColumns.length">Calls</th>
                <th class="grouphdr strikehdr"></th>
                <th class="grouphdr puthdr" [attr.colspan]="activeColumns.length">Puts</th>
              </tr>
              <tr>
                @for (column of callColumns; track column.key) {
                  <th
                    class="callhdr"
                    [class.sorted]="isSorted(column.key, 'call')"
                    (click)="sortBy(column.key, 'call')"
                  >
                    {{ column.label }}
                  </th>
                }
                <th class="strikehdr" (click)="sortBy('strike', 'call')">Strike</th>
                @for (column of activeColumns; track column.key) {
                  <th
                    class="puthdr"
                    [class.sorted]="isSorted(column.key, 'put')"
                    (click)="sortBy(column.key, 'put')"
                  >
                    {{ column.label }}
                  </th>
                }
              </tr>
            </thead>
            <tbody>
              @for (row of visibleRows; track row.strike) {
                <tr [class.atm]="row.strike === atmStrike">
                  @for (column of callColumns; track column.key) {
                    <td
                      [class.itm]="row.call.itm"
                      [class.positive]="signedValue(row.call, column.key) > 0"
                      [class.negative]="signedValue(row.call, column.key) < 0"
                    >
                      {{ cellValue(row.call, column.key) }}
                      @if (column.key === 'oi') {
                        <span class="oi-bar" [class]="barClass(row.call.oi)"></span>
                      }
                    </td>
                  }
                  <td class="strike">{{ integer(row.strike) }}</td>
                  @for (column of activeColumns; track column.key) {
                    <td
                      [class.itm]="row.put.itm"
                      [class.positive]="signedValue(row.put, column.key) > 0"
                      [class.negative]="signedValue(row.put, column.key) < 0"
                    >
                      {{ cellValue(row.put, column.key) }}
                      @if (column.key === 'oi') {
                        <span class="oi-bar" [class]="barClass(row.put.oi)"></span>
                      }
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
    <div class="chart-stack">
      @for (chart of oiCharts; track chart.kind) {
      <div class="panel chart-panel">
        <p class="panel-title">{{ chart.title }}</p>
        <div class="chart-container">
          <svg
            [attr.viewBox]="'0 0 ' + chartWidth + ' ' + chartHeight"
            role="img"
            [attr.aria-label]="chart.title"
          >
            @for (bar of chartBarCoordinates(chart.kind); track bar.index) {
              <rect
                [attr.x]="bar.x - bar.width - 1"
                [attr.y]="bar.callY"
                [attr.width]="bar.width"
                [attr.height]="bar.callHeight"
                class="oi-bar-chart call-bar"
                [class.hovered]="isChartPointHovered(chart.kind, bar.index)"
              ></rect>
              <rect
                [attr.x]="bar.x + 1"
                [attr.y]="bar.putY"
                [attr.width]="bar.width"
                [attr.height]="bar.putHeight"
                class="oi-bar-chart put-bar"
                [class.hovered]="isChartPointHovered(chart.kind, bar.index)"
              ></rect>
            }
            <line
              [attr.x1]="chartPlotLeft"
              [attr.y1]="chartPlotBottom"
              [attr.x2]="chartPlotRight"
              [attr.y2]="chartPlotBottom"
              class="chart-axis"
            ></line>
            @for (label of chartStrikeLabels(chart.kind); track label.x) {
              <text [attr.x]="label.x" [attr.y]="chartHeight - 10" class="chart-axis-label">
                {{ label.text }}
              </text>
            }
            @if (atmChartX(chart.kind); as atmX) {
              <line
                [attr.x1]="atmX"
                [attr.y1]="chartPlotTop"
                [attr.x2]="atmX"
                [attr.y2]="chartPlotBottom"
                class="chart-atm-line"
              ></line>
              <text [attr.x]="atmX" [attr.y]="chartPlotTop - 4" class="chart-atm-label">
                ATM {{ integer(atmStrike) }}
              </text>
            }
            @if (chartTooltip?.kind === chart.kind) {
              <line
                [attr.x1]="chartTooltip!.x"
                [attr.y1]="chartPlotTop"
                [attr.x2]="chartTooltip!.x"
                [attr.y2]="chartPlotBottom"
                class="chart-guide"
              ></line>
            }
            <rect
              class="chart-hit-area"
              x="0"
              y="0"
              [attr.width]="chartWidth"
              [attr.height]="chartHeight"
              tabindex="0"
              [attr.aria-label]="'Hover to inspect ' + chart.title.toLowerCase()"
              (mousemove)="onChartPointer(chart.kind, $event)"
              (mouseleave)="hideChartTooltip()"
              (touchstart)="onChartPointer(chart.kind, $event)"
              (focus)="onChartFocus(chart.kind)"
            ></rect>
          </svg>
          @if (chartTooltip?.kind === chart.kind) {
            <app-chart-tooltip
              [title]="'Strike ' + integer(chartTooltip!.strike)"
              [rows]="chartTooltipRows(chart.kind)"
              [left]="chartTooltip!.left"
              [top]="chartTooltip!.top"
            ></app-chart-tooltip>
          }
        </div>
      </div>
      }
    </div>
    }
  </section>`,
  styleUrls: ['./options-chain.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OptionsChainComponent implements OnInit, OnDestroy {
  private readonly api = inject(GreeksCalculatorService);
  private readonly pricing = inject(PricingContextService);
  private readonly chainApi = inject(OptionsChainService);
  private readonly toast = inject(ToastService);
  private readonly cd = inject(ChangeDetectorRef);
  private readonly route = inject(ActivatedRoute);
  private readonly liveAccess = inject(LiveDataAccessService);
  private readonly selection$ = new Subject<string>();
  private readonly destroy$ = new Subject<void>();
  readonly strikeFilters = [
    { value: 5, label: 'ATM ±5' },
    { value: 10, label: 'ATM ±10' },
    { value: 20, label: 'ATM ±20' },
    { value: 0, label: 'All' },
  ];
  readonly moneyFilters = [
    { value: 'all' as MoneyFilter, label: 'All' },
    { value: 'call' as MoneyFilter, label: 'ITM calls' },
    { value: 'put' as MoneyFilter, label: 'ITM puts' },
  ];
  readonly columnOptions: Array<{ key: ColumnKey; label: string }> = [
    { key: 'oi', label: 'OI' },
    { key: 'oiChange', label: 'Chg OI' },
    { key: 'volume', label: 'Volume' },
    { key: 'iv', label: 'IV' },
    { key: 'ltp', label: CLOSE_EOD_LABEL },
    { key: 'delta', label: 'Delta' },
    { key: 'gamma', label: 'Gamma' },
    { key: 'theta', label: 'Theta' },
    { key: 'vega', label: 'Vega' },
  ];
  columns: Record<ColumnKey, boolean> = {
    oi: true,
    oiChange: true,
    volume: true,
    iv: true,
    ltp: true,
    delta: false,
    gamma: false,
    theta: false,
    vega: false,
  };
  sortKey: SortKey = 'strike';
  sortSide: Side = 'call';
  sortDescending = false;
  symbols: string[] = [];
  filteredSymbols: string[] = [];
  symbol = '';
  expiry = '';
  expiryOptions: string[] = [];
  details: GreeksSymbolDetails | null = null;
  view: OptionsChainViewModel | null = null;
  rows: OptionsChainRow[] = [];
  strikeSearch = '';
  strikeFilter = 10;
  moneyFilter: MoneyFilter = 'all';
  side: Side = 'call';
  live = false;
  loading = false;
  symbolsLoading = true;
  detailsLoading = false;
  suggestionsOpen = false;
  highlightedIndex = -1;
  error = '';
  columnsMenuOpen = false;
  chartTooltip: ChartTooltipState | null = null;
  /** SVG user-space geometry shared by both OI charts (the SVG scales to its container width). */
  readonly chartWidth = 1000;
  readonly chartHeight = 400;
  readonly chartPlotLeft = 20;
  readonly chartPlotRight = 980;
  readonly chartPlotTop = 28;
  readonly chartPlotBottom = 360;
  readonly oiCharts: ReadonlyArray<{ kind: 'oi' | 'oiChange'; title: string }> = [
    { kind: 'oi', title: 'Open Interest by Strike' },
    { kind: 'oiChange', title: 'Open Interest Change by Strike' },
  ];
  private symbolsRequested = false;
  private chainRequest: Subscription | null = null;
  ngOnInit(): void {
    if (this.liveAccess.requestedLive(this.route.snapshot)) this.live = true;
    this.setupSelection();
    // Live Data is a separate view: symbol/EOD APIs load only when EOD is opened.
    if (!this.live) this.loadSymbols();
  }
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.selection$.complete();
  }
  get spot(): number | null {
    return this.view?.spot ?? this.details?.underlying ?? null;
  }
  /** Approved pricing inputs for the selected expiry (instrument type, underlying, rate, dividend), once resolved. */
  pricingContext: PricingContext | null = null;
  get ivUnderlying(): number | null {
    return this.pricingContext?.ok ? this.pricingContext.underlying : null;
  }
  /** Where the IV underlying and rates come from, or why implied volatility is unavailable. */
  get ivBasisNote(): string {
    const context = this.pricingContext;
    if (!context) return this.loading ? 'Loading…' : '';
    if (!context.ok) return describePricingFailure(context.reason);
    const rates = `rate ${(context.riskFreeRate * 100).toFixed(2)}% · dividend ${(context.dividendYield * 100).toFixed(2)}%`;
    return context.kind === 'index'
      ? `Spot index value · ${rates}`
      : `Futures close, ${formatDisplayDate(this.expiry)} expiry${context.futures?.tradeDate ? ` (${formatDisplayDate(context.futures.tradeDate)})` : ''} · ${rates}`;
  }
  get sourceNote(): string {
    return this.symbol
      ? `Close (EOD)${this.details?.trade_date ? ` · ${this.details.trade_date}` : ''}`
      : '';
  }
  get atmStrike(): number | null {
    return this.details?.atm_strike ?? null;
  }
  get activeColumns() {
    return this.columnOptions.filter((item) => this.columns[item.key]);
  }
  get callColumns() {
    return this.activeColumns.slice().reverse();
  }
  get visibleColumnCount() {
    return this.activeColumns.length;
  }
  get visibleRows(): OptionsChainRow[] {
    let result = this.rows.filter(
      (row) => !this.strikeSearch || String(row.strike).includes(this.strikeSearch),
    );
    if (this.moneyFilter === 'call') result = result.filter((row) => row.call.itm);
    if (this.moneyFilter === 'put') result = result.filter((row) => row.put.itm);
    if (this.strikeFilter)
      result = result
        .slice()
        .sort(
          (a, b) =>
            Math.abs(a.strike - (this.spot ?? a.strike)) -
            Math.abs(b.strike - (this.spot ?? b.strike)),
        )
        .slice(0, this.strikeFilter * 2 + 1);
    const value = (row: OptionsChainRow) =>
      this.sortKey === 'strike' ? row.strike : row[this.sortSide][this.sortKey];
    return result.sort((a, b) => {
      const left = value(a),
        right = value(b);
      return this.sortDescending ? Number(right) - Number(left) : Number(left) - Number(right);
    });
  }
  get summary() {
    const rows = this.visibleRows;
    const call = rows.length ? rows.reduce((sum, row) => sum + row.call.oi, 0) : null;
    const put = rows.length ? rows.reduce((sum, row) => sum + row.put.oi, 0) : null;
    return {
      call,
      put,
      pcr: call && put !== null ? put / call : null,
    };
  }
  readonly highestPutOiTooltip = 'Strike with the highest put open interest for this expiry.';
  readonly highestCallOiTooltip = 'Strike with the highest call open interest for this expiry.';
  /** Strikes with the highest put/call OI across every strike of the selected expiry (not the filtered view). */
  /** Computed from every strike of the selected expiry; the single source for the tile (the API's max_pain is not used). */
  get maxPain(): number | null {
    return this.loading ? null : computeMaxPain(this.rows);
  }
  get expiryDisplayNote(): string {
    return expiryNote(this.expiry);
  }
  get highestOiStrikes(): { put: number | null; call: number | null } {
    // While a new expiry loads, `rows` still holds the previous expiry; do not present it as this expiry's value.
    const rows = this.loading ? [] : this.rows;
    const highest = (oiOf: (row: OptionsChainRow) => number): number | null => {
      // Only strikes with real, positive OI qualify; all-zero or missing OI means there is no answer.
      const usable = rows.filter((row) => Number.isFinite(oiOf(row)) && oiOf(row) > 0);
      return usable.length ? usable.reduce((a, b) => (oiOf(a) > oiOf(b) ? a : b)).strike : null;
    };
    return { put: highest((row) => row.put.oi), call: highest((row) => row.call.oi) };
  }
  selectSymbol(value: string): void {
    if (!this.symbols.includes(value)) return;
    this.symbol = value;
    this.suggestionsOpen = false;
    this.selection$.next(value);
  }
  clearSymbol(): void {
    this.symbol = '';
    this.expiry = '';
    this.expiryOptions = [];
    this.details = null;
    this.view = null;
    this.rows = [];
    this.pricingContext = null;
    this.selection$.next('');
  }
  filterSymbols(): void {
    const query = this.symbol.toLowerCase();
    this.filteredSymbols = query
      ? this.symbols.filter((value) => value.toLowerCase().includes(query))
      : this.symbols;
    this.suggestionsOpen = true;
    this.highlightedIndex = -1;
  }
  closeSuggestions(): void {
    window.setTimeout(() => {
      this.suggestionsOpen = false;
      this.cd.markForCheck();
    }, 150);
  }
  onSymbolKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.highlightedIndex = (this.highlightedIndex + 1) % this.filteredSymbols.length;
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.highlightedIndex =
        this.highlightedIndex <= 0 ? this.filteredSymbols.length - 1 : this.highlightedIndex - 1;
    } else if (event.key === 'Enter' && this.filteredSymbols.length) {
      event.preventDefault();
      this.selectSymbol(this.filteredSymbols[Math.max(0, this.highlightedIndex)]);
    } else if (event.key === 'Escape') this.suggestionsOpen = false;
  }
  loadChain(): void {
    if (!this.symbol || !this.expiry || this.live) return;
    // Only the newest request may update the screen: a superseded one is cancelled here.
    this.chainRequest?.unsubscribe();
    this.error = '';
    this.loading = true;
    this.pricingContext = null;
    const symbol = this.symbol;
    const expiry = this.expiry;
    this.chainRequest = combineLatest({
      view: this.chainApi.getOptionChain({ symbol, expiry }),
      context: this.pricing.resolve(symbol, expiry, this.details?.underlying),
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ view, context }) => {
          this.view = view;
          this.pricingContext = context;
          this.rows = view.rows.map((row) => this.calculateRowGreeks(row, context));
          this.loading = false;
          this.cd.markForCheck();
        },
        error: () => {
          this.view = null;
          this.rows = [];
          this.pricingContext = null;
          this.loading = false;
          this.error = 'Unable to load the option chain. Please try again.';
          this.toast.error(this.error);
          this.cd.markForCheck();
        },
      });
  }
  formatExpiry(value: string): string {
    return formatDisplayDate(value);
  }
  toggleColumn(key: ColumnKey): void {
    if (this.columns[key] && this.visibleColumnCount === 1) return;
    this.columns[key] = !this.columns[key];
  }
  closeColumnsMenu(): void {
    this.columnsMenuOpen = false;
  }
  strikeLabel(value: number): string {
    return value ? `±${value}` : 'All';
  }
  moneyLabel(value: MoneyFilter): string {
    return value === 'all' ? 'All' : value === 'call' ? 'ITM Calls' : 'ITM Puts';
  }
  sortBy(key: SortKey, side: Side): void {
    if (this.sortKey === key && this.sortSide === side) this.sortDescending = !this.sortDescending;
    else {
      this.sortKey = key;
      this.sortSide = side;
      this.sortDescending = key !== 'strike';
    }
  }
  isSorted(key: ColumnKey, side: Side): boolean {
    return this.sortKey === key && this.sortSide === side;
  }
  signedValue(value: OptionsChainSide, key: ColumnKey): number {
    return key === 'oiChange' ? value.oiChange : key === 'ltp' ? value.ltpChange : 0;
  }
  cellValue(value: OptionsChainSide, key: ColumnKey): string {
    if (key === 'oi') return this.integer(value.oi);
    if (key === 'oiChange')
      return `${value.oiChange >= 0 ? '+' : ''}${this.integer(value.oiChange)}`;
    if (key === 'volume') return this.integer(value.volume);
    if (key === 'iv') return value.iv > 0 ? `${value.iv.toFixed(2)}%` : '–';
    if (key === 'ltp') return value.ltp.toFixed(2);
    if (key === 'delta') return value.delta == null ? '–' : value.delta.toFixed(3);
    if (key === 'gamma') return value.gamma == null ? '–' : value.gamma.toFixed(5);
    if (key === 'theta') return value.theta == null ? '–' : value.theta.toFixed(2);
    return value.vega == null ? '–' : value.vega.toFixed(2);
  }
  barClass(value: number): string {
    const max = Math.max(1, ...this.visibleRows.flatMap((row) => [row.call.oi, row.put.oi]));
    return `bar-${Math.min(10, Math.max(0, Math.round((value / max) * 10)))}`;
  }
  chartPath(points: Array<{ x: number; y: number }> | undefined): string {
    return points && points.length >= 2 ? this.chartPointPath(points) : '';
  }
  chartPointCoordinates(kind: ChartKind, side: Side): ChartPointCoordinate[] {
    return this.chartCoordinates(this.chartSeries(kind, side));
  }
  /** X of the bar group at `index`; shared by the bars, strike labels, hover guide and ATM line. */
  private chartBarX(index: number, count: number): number {
    return (
      this.chartPlotLeft +
      (index / Math.max(1, count - 1)) * (this.chartPlotRight - this.chartPlotLeft)
    );
  }
  /** X of the ATM strike on the bar scale; interpolated between neighbouring strikes, null if outside the data. */
  atmChartX(kind: ChartKind): number | null {
    const atm = this.atmStrike;
    const strikes = this.chartSeries(kind, 'call').map((point) => point.x);
    if (atm == null || !strikes.length) return null;
    const exact = strikes.indexOf(atm);
    if (exact >= 0) return this.chartBarX(exact, strikes.length);
    for (let i = 0; i < strikes.length - 1; i++) {
      const [a, b] = [strikes[i], strikes[i + 1]];
      if ((atm > a && atm < b) || (atm < a && atm > b)) {
        return this.chartBarX(i + (atm - a) / (b - a), strikes.length);
      }
    }
    return null;
  }
  chartStrikeLabels(kind: ChartKind): Array<{ x: number; text: string }> {
    const strikes = this.chartSeries(kind, 'call').map((point) => point.x);
    const step = Math.max(1, Math.ceil(strikes.length / 14));
    return strikes
      .map((strike, index) => ({ x: this.chartBarX(index, strikes.length), text: String(strike), index }))
      .filter((label) => label.index % step === 0);
  }
  chartBarCoordinates(kind: 'oi' | 'oiChange' = 'oi'): ChartBarCoordinate[] {
    const call = this.chartSeries(kind, 'call');
    const put = this.chartSeries(kind, 'put');
    if (!call.length || !put.length) return [];
    const isChange = kind === 'oiChange';
    const max = isChange
      ? Math.max(
          1,
          ...call.map((point) => Math.abs(point.y)),
          ...put.map((point) => Math.abs(point.y)),
        )
      : Math.max(1, ...call.map((point) => point.y), ...put.map((point) => point.y));
    const plotHeight = this.chartPlotBottom - this.chartPlotTop;
    const baseline = isChange ? this.chartPlotTop + plotHeight / 2 : this.chartPlotBottom;
    const extent = isChange ? plotHeight / 2 - 4 : plotHeight;
    const width = Math.max(
      2,
      Math.min(14, (this.chartPlotRight - this.chartPlotLeft) / call.length / 2.4),
    );
    return call.map((point, index) => ({
      index,
      x: this.chartBarX(index, call.length),
      callY: this.barY(point.y, max, baseline, extent),
      putY: this.barY(put[index]?.y ?? 0, max, baseline, extent),
      callHeight: (Math.abs(point.y) / max) * extent,
      putHeight: (Math.abs(put[index]?.y ?? 0) / max) * extent,
      width,
    }));
  }
  private barY(value: number, max: number, baseline: number, extent: number): number {
    return value >= 0 ? baseline - (value / max) * extent : baseline;
  }
  onChartPointer(kind: ChartKind, event: MouseEvent | TouchEvent): void {
    const points = this.chartSeries(kind, 'call');
    const putPoints = this.chartSeries(kind, 'put');
    if (!points?.length || !putPoints?.length) return;

    const target = event.currentTarget as SVGRectElement;
    const bounds = target.getBoundingClientRect();
    const clientX = 'touches' in event ? event.touches[0]?.clientX : event.clientX;
    const clientY = 'touches' in event ? event.touches[0]?.clientY : event.clientY;
    if (clientX == null || clientY == null || !bounds.width || !bounds.height) return;

    const ratio = Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width));
    const minX = Math.min(...points.map((point) => point.x));
    const maxX = Math.max(...points.map((point) => point.x));
    const dataX = minX + ratio * (maxX - minX);
    const index = points.reduce(
      (nearest, point, pointIndex) =>
        Math.abs(point.x - dataX) < Math.abs(points[nearest].x - dataX) ? pointIndex : nearest,
      0,
    );
    const point = points[index];
    const putIndex = putPoints.reduce(
      (nearest, putPoint, pointIndex) =>
        Math.abs(putPoint.x - point.x) < Math.abs(putPoints[nearest].x - point.x)
          ? pointIndex
          : nearest,
      0,
    );
    const relativeX = this.chartBarX(index, points.length);
    const relativeY = Math.max(10, Math.min(bounds.height - 10, clientY - bounds.top));
    const container = target.parentElement?.parentElement?.getBoundingClientRect();
    if (!container) return;
    const tooltipWidth = 174;
    const tooltipHeight = 78;
    const left = Math.max(
      8,
      Math.min(container.width - tooltipWidth - 8, clientX - container.left + 12),
    );
    const top = relativeY < tooltipHeight ? relativeY + 16 : relativeY - tooltipHeight;
    this.chartTooltip = {
      kind,
      index,
      x: relativeX,
      y: relativeY,
      left,
      top: Math.max(8, Math.min(container.height - tooltipHeight - 8, top)),
      strike: point.x,
      call: point.y,
      put: putPoints[putIndex].y,
    };
  }
  onChartFocus(kind: ChartKind): void {
    const points = this.chartSeries(kind, 'call');
    const putPoints = this.chartSeries(kind, 'put');
    if (!points?.length || !putPoints?.length) return;
    const point = points[0];
    this.chartTooltip = {
      kind,
      index: 0,
      x: this.chartBarX(0, points.length),
      y: this.chartCoordinates(points)[0].y,
      left: 18,
      top: 18,
      strike: point.x,
      call: point.y,
      put: putPoints[0].y,
    };
  }
  hideChartTooltip(): void {
    this.chartTooltip = null;
  }
  isChartPointHovered(kind: ChartKind, index: number): boolean {
    return this.chartTooltip?.kind === kind && this.chartTooltip.index === index;
  }
  chartTooltipRows(kind: ChartKind): ChartTooltipRow[] {
    if (!this.chartTooltip) return [];
    return kind === 'oi'
      ? [
          { label: 'Call OI', value: this.integer(this.chartTooltip.call), tone: 'call' },
          { label: 'Put OI', value: this.integer(this.chartTooltip.put), tone: 'put' },
        ]
      : [
          {
            label: 'Call Chg OI',
            value: `${this.chartTooltip.call >= 0 ? '+' : ''}${this.integer(this.chartTooltip.call)}`,
            tone: 'call',
          },
          {
            label: 'Put Chg OI',
            value: `${this.chartTooltip.put >= 0 ? '+' : ''}${this.integer(this.chartTooltip.put)}`,
            tone: 'put',
          },
        ];
  }
  chartSeries(kind: ChartKind, side: Side): Array<{ x: number; y: number }> {
    if (kind === 'oi') {
      const chartPoints = side === 'call' ? this.view?.chart.callOi : this.view?.chart.putOi;
      if (chartPoints?.length) return chartPoints;
      return this.rows.map((row) => ({
        x: row.strike,
        y: side === 'call' ? row.call.oi : row.put.oi,
      }));
    }
    return this.rows.map((row) => ({
      x: row.strike,
      y: side === 'call' ? row.call.oiChange : row.put.oiChange,
    }));
  }
  private chartCoordinates(
    points: Array<{ x: number; y: number }> | undefined,
  ): ChartPointCoordinate[] {
    if (!points?.length) return [];
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return points.map((point, index) => ({
      index,
      x: 10 + ((point.x - minX) / (maxX - minX || 1)) * 540,
      y: 190 - ((point.y - minY) / (maxY - minY || 1)) * 170,
    }));
  }
  private chartPointPath(points: Array<{ x: number; y: number }> | undefined): string {
    const coordinates = this.chartCoordinates(points);
    return coordinates
      .map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)},${point.y.toFixed(1)}`)
      .join(' ');
  }
  formatPrice(value: number): string {
    return `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  integer(value: number | null): string {
    return value == null ? '–' : Math.round(value).toLocaleString('en-IN');
  }
  decimal(value: number | null): string {
    return value == null ? '–' : value.toFixed(2);
  }
  setLive(live: boolean): void {
    this.live = live;
    this.chartTooltip = null;
    if (live) {
      // Cancel in-flight EOD requests; nothing from EOD runs while Live Data is shown.
      this.chainRequest?.unsubscribe();
      if (this.detailsLoading || this.loading) this.selection$.next('');
      return;
    }
    if (!this.symbolsRequested) this.loadSymbols();
    else if (!this.view && this.symbol) this.selectSymbol(this.symbol);
  }
  private setupSelection(): void {
    this.selection$
      .pipe(
        takeUntil(this.destroy$),
        tap((symbol) => {
          this.chainRequest?.unsubscribe();
          this.error = '';
          this.detailsLoading = Boolean(symbol);
          this.loading = Boolean(symbol);
          this.rows = [];
          this.view = null;
          this.pricingContext = null;
          this.expiryOptions = [];
        }),
        switchMap((symbol) =>
          symbol
            ? this.api.getSymbolDetails({ symbol }).pipe(
                catchError(() => {
                  this.error = 'Unable to load symbol details. Please try again.';
                  return EMPTY;
                }),
              )
            : EMPTY,
        ),
      )
      .subscribe((details) => {
        this.details = details;
        const raw = details as GreeksSymbolDetails & {
          expiry_date: string | number | Array<string | number>;
        };
        const rawExpiries = Array.isArray(raw.expiry_date)
          ? raw.expiry_date
          : raw.expiry_date
            ? [raw.expiry_date]
            : [];
        this.expiryOptions = rawExpiries.map(String);
        this.expiry = this.expiryOptions[0] ?? '';
        this.detailsLoading = false;
        this.loadChain();
        this.cd.markForCheck();
      });
  }
  /**
   * IV and Greeks of each side from that contract's own Close (EOD), with the approved underlying, rate and dividend.
   * Without a resolved context, or on expiry day, a side has no IV and shows "–"; nothing is estimated.
   */
  private calculateRowGreeks(row: OptionsChainRow, context: PricingContext): OptionsChainRow {
    if (!context.ok) return this.withoutGreeks(row);
    const days = daysToExpiry(this.expiry);
    const side = (kind: Side, option: OptionsChainSide): OptionsChainSide => {
      const solved = contractGreeks(context, { side: kind, strike: row.strike, days, close: option.ltp });
      return { ...option, iv: solved.ivPct ?? 0, delta: solved.delta, gamma: solved.gamma, theta: solved.theta, vega: solved.vega };
    };
    return { ...row, call: side('call', row.call), put: side('put', row.put) };
  }
  private withoutGreeks(row: OptionsChainRow): OptionsChainRow {
    const clear = (option: OptionsChainSide): OptionsChainSide => ({ ...option, iv: 0, delta: null, gamma: null, theta: null, vega: null });
    return { ...row, call: clear(row.call), put: clear(row.put) };
  }
  private loadSymbols(): void {
    this.symbolsRequested = true;
    this.api
      .getSymbols()
      .pipe(
        takeUntil(this.destroy$),
        catchError(() => {
          this.toast.error('Unable to load symbols. Please try again.');
          return of([] as string[]);
        }),
        finalize(() => {
          this.symbolsLoading = false;
          this.cd.markForCheck();
        }),
      )
      .subscribe((symbols) => {
        this.symbols = symbols;
        this.filteredSymbols = symbols;
        const initial = symbols.includes(DefaultStock) ? DefaultStock : symbols[0];
        if (initial) this.selectSymbol(initial);
      });
  }
}
