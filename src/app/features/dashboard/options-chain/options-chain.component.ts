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
import { EMPTY, Subject, Subscription, catchError, finalize, of, switchMap, takeUntil, tap } from 'rxjs';
import { ToastService } from '../../../core/services/toast.service';
import { GreeksCalculatorService } from '../greeks/greeks-calculator.service';
import { GreeksSymbolDetails } from '../greeks/greeks.model';
import { DefaultStock } from '../../../shared/services/constantFile';
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
      Full call and put ladder with open interest, volume, implied volatility and Greeks.
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
        </div>
        <div class="field-block">
          <label>Underlying price</label><input type="number" [ngModel]="spot" readonly />
        </div>
        <div class="field-block">
          <label>Base volatility %</label><input type="number" [ngModel]="volatility" readonly />
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
        <div class="num">{{ integer(view?.maxPain ?? null) }}</div>
      </div>
      <div class="sitem">
        <div class="lab">Support</div>
        <div class="num call-value">{{ integer(summary.support) }}</div>
      </div>
      <div class="sitem">
        <div class="lab">Resistance</div>
        <div class="num put-value">{{ integer(summary.resistance) }}</div>
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
        <div class="empty">Loading option chain…</div>
      } @else if (!visibleRows.length) {
        <div class="empty">
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
    <div class="chart-grid">
      <div class="panel chart-panel">
        <p class="panel-title">Open Interest by Strike</p>
        <div class="chart-container">
          <svg viewBox="0 0 560 200" role="img" aria-label="Open interest by strike">
            @for (bar of chartBarCoordinates(); track bar.index) {
              <rect
                [attr.x]="bar.x - bar.width - 1"
                [attr.y]="bar.callY"
                [attr.width]="bar.width"
                [attr.height]="bar.callHeight"
                class="oi-bar-chart call-bar"
                [class.hovered]="isChartPointHovered('oi', bar.index)"
              ></rect>
              <rect
                [attr.x]="bar.x + 1"
                [attr.y]="bar.putY"
                [attr.width]="bar.width"
                [attr.height]="bar.putHeight"
                class="oi-bar-chart put-bar"
                [class.hovered]="isChartPointHovered('oi', bar.index)"
              ></rect>
            }
            @if (chartTooltip?.kind === 'oi') {
              <line
                [attr.x1]="chartTooltip!.x"
                y1="10"
                [attr.x2]="chartTooltip!.x"
                y2="190"
                class="chart-guide"
              ></line>
            }
            <rect
              class="chart-hit-area"
              x="0"
              y="0"
              width="560"
              height="200"
              tabindex="0"
              aria-label="Hover to inspect open interest by strike"
              (mousemove)="onChartPointer('oi', $event)"
              (mouseleave)="hideChartTooltip()"
              (touchstart)="onChartPointer('oi', $event)"
              (focus)="onChartFocus('oi')"
            ></rect>
          </svg>
          @if (chartTooltip?.kind === 'oi') {
            <app-chart-tooltip
              [title]="'Strike ' + integer(chartTooltip!.strike)"
              [rows]="chartTooltipRows('oi')"
              [left]="chartTooltip!.left"
              [top]="chartTooltip!.top"
            ></app-chart-tooltip>
          }
        </div>
      </div>
      <div class="panel chart-panel">
        <p class="panel-title">Open Interest Change by Strike</p>
        <div class="chart-container">
          <svg viewBox="0 0 560 200" role="img" aria-label="Open interest change by strike">
            @for (bar of chartBarCoordinates('oiChange'); track bar.index) {
              <rect
                [attr.x]="bar.x - bar.width - 1"
                [attr.y]="bar.callY"
                [attr.width]="bar.width"
                [attr.height]="bar.callHeight"
                class="oi-bar-chart call-bar"
                [class.hovered]="isChartPointHovered('oiChange', bar.index)"
              ></rect>
              <rect
                [attr.x]="bar.x + 1"
                [attr.y]="bar.putY"
                [attr.width]="bar.width"
                [attr.height]="bar.putHeight"
                class="oi-bar-chart put-bar"
                [class.hovered]="isChartPointHovered('oiChange', bar.index)"
              ></rect>
            }
            @if (chartTooltip?.kind === 'oiChange') {
              <line
                [attr.x1]="chartTooltip!.x"
                y1="15"
                [attr.x2]="chartTooltip!.x"
                y2="185"
                class="chart-guide"
              ></line>
            }
            <rect
              class="chart-hit-area"
              x="0"
              y="0"
              width="560"
              height="200"
              tabindex="0"
              aria-label="Hover to inspect open interest change by strike"
              (mousemove)="onChartPointer('oiChange', $event)"
              (mouseleave)="hideChartTooltip()"
              (touchstart)="onChartPointer('oiChange', $event)"
              (focus)="onChartFocus('oiChange')"
            ></rect>
          </svg>
          @if (chartTooltip?.kind === 'oiChange') {
            <app-chart-tooltip
              [title]="'Strike ' + integer(chartTooltip!.strike)"
              [rows]="chartTooltipRows('oiChange')"
              [left]="chartTooltip!.left"
              [top]="chartTooltip!.top"
            ></app-chart-tooltip>
          }
        </div>
      </div>
    </div>
    }
  </section>`,
  styleUrls: ['./options-chain.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OptionsChainComponent implements OnInit, OnDestroy {
  private readonly api = inject(GreeksCalculatorService);
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
    { key: 'ltp', label: 'LTP' },
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
  get volatility(): number | null {
    return this.details?.hv20 ?? 12.5;
  }
  get sourceNote(): string {
    return this.symbol
      ? `BhavCopy EOD close${this.details?.trade_date ? ` · ${this.details.trade_date}` : ''}`
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
      support: rows.length ? rows.reduce((a, b) => (a.put.oi > b.put.oi ? a : b)).strike : null,
      resistance: rows.length
        ? rows.reduce((a, b) => (a.call.oi > b.call.oi ? a : b)).strike
        : null,
    };
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
    if (this.symbol && this.expiry && !this.live)
      this.chainRequest = this.chainApi
        .getOptionChain({ symbol: this.symbol, expiry: this.expiry })
        .pipe(takeUntil(this.destroy$))
        .subscribe((view) => {
          this.view = view;
          this.rows = view.rows.map((row) => this.calculateRowGreeks(row));
          this.loading = false;
          this.cd.markForCheck();
        });
  }
  formatExpiry(value: string): string {
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
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
    const baseline = isChange ? 100 : 190;
    const extent = isChange ? 85 : 170;
    const width = Math.max(2, Math.min(9, 520 / call.length));
    return call.map((point, index) => ({
      index,
      x: 10 + (index / Math.max(1, call.length - 1)) * 540,
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
    const relativeX = this.chartCoordinates(points)[index]?.x ?? 10;
    const relativeY = Math.max(10, Math.min(190, clientY - bounds.top));
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
      x: this.chartCoordinates(points)[0].x,
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
          this.detailsLoading = Boolean(symbol);
          this.loading = Boolean(symbol);
          this.rows = [];
          this.view = null;
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
  private calculateRowGreeks(row: OptionsChainRow): OptionsChainRow {
    const spot = this.spot;
    const expiryDays = this.resolveExpiryDays(this.expiry);
    const baseVolPct = this.volatility;
    if (spot === null || spot <= 0 || expiryDays <= 0 || baseVolPct === null) return row;

    const iv = this.chainIV(spot, row.strike, baseVolPct) * 100;
    const callGreeks = this.calculateSideGreeks('call', row.strike, iv, spot, expiryDays);
    const putGreeks = this.calculateSideGreeks('put', row.strike, iv, spot, expiryDays);
    return {
      ...row,
      call: { ...row.call, iv, ...callGreeks },
      put: { ...row.put, iv, ...putGreeks },
    };
  }
  // No live feed exists yet, so IV is always derived from the EOD base volatility.
  private chainIV(spot: number, strike: number, baseVolPct: number): number {
    const base = baseVolPct / 100;
    const moneyness = Math.log(strike / spot);
    const adjustment = Math.max(-0.45, Math.min(1.2, -2 * moneyness + 25 * moneyness * moneyness));
    return base * (1 + adjustment);
  }
  private calculateSideGreeks(
    side: Side,
    strike: number,
    volatility: number,
    spot: number,
    expiryDays: number,
  ): Partial<OptionsChainRow['call']> | null {
    if (!Number.isFinite(volatility) || volatility <= 0) return null;
    const result = this.api.calculateAll({
      spot,
      strike,
      rate: 0,
      vol: volatility,
      expiryDays,
      dividend: 0,
      minimumExpiryDays: 0.5,
    });
    return side === 'call'
      ? { delta: result.deltaCall, gamma: result.gamma, theta: result.thetaCall, vega: result.vega }
      : { delta: result.deltaPut, gamma: result.gamma, theta: result.thetaPut, vega: result.vega };
  }
  private resolveExpiryDays(value: string): number {
    if (!value) return 0;
    const expiryTime = Date.parse(`${value}T00:00:00Z`);
    const tradeDate = this.details?.trade_date;
    const startTime = tradeDate ? Date.parse(`${tradeDate}T00:00:00Z`) : Date.now();
    if (Number.isFinite(expiryTime) && Number.isFinite(startTime)) {
      return Math.max(1, Math.round((expiryTime - startTime) / 86400000));
    }
    const numericExpiry = Number(value);
    return Number.isFinite(numericExpiry) ? Math.max(1, numericExpiry) : 0;
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
