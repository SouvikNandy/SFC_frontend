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
import { EMPTY, Subject, catchError, finalize, of, switchMap, takeUntil, tap } from 'rxjs';
import { ToastService } from '../../../core/services/toast.service';
import { GreeksCalculatorService } from '../greeks/greeks-calculator.service';
import { GreeksSymbolDetails } from '../greeks/greeks.model';
import { DefaultStock } from '../../../shared/services/constantFile';
import { OptionsChainService } from './options-chain.service';
import { OptionsChainRow, OptionsChainSide, OptionsChainViewModel } from './models/chain.model';

type Side = 'call' | 'put';
type ColumnKey = 'oi' | 'oiChange' | 'volume' | 'iv' | 'ltp' | 'delta' | 'gamma' | 'theta' | 'vega';
type MoneyFilter = 'all' | 'call' | 'put';
type SortKey = ColumnKey | 'strike';

@Component({
  selector: 'app-options-chain',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: ` <section class="sfc-page-pad options-chain-page">
    <div class="titlebar">
      <h1>Options Chain</h1>
      <span class="ticker">{{ symbol || '—' }}</span
      ><span class="lastpx">{{ spot === null ? '—' : formatPrice(spot) }}</span
      ><span class="srcnote">{{ sourceNote }}</span>
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
          (click)="live = false"
        >
          EOD data <em>from BhavCopy</em></button
        ><button
          type="button"
          [class.active]="live"
          [attr.aria-selected]="live"
          (click)="live = true"
        >
          Live data <em>Premium</em>
        </button>
      </div>
      @if (live) {
        <div class="live-lock">
          <div>
            <p class="live-lock-title">Live chain is a Premium feature</p>
            <p class="live-lock-desc">
              Stream real-time LTP, open interest and volume with intraday OI change, instead of the
              previous close.
            </p>
          </div>
          <button type="button" class="calc" (click)="upgrade()">Upgrade to Premium</button>
        </div>
      }
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
    </div>
    <div class="panel filters-panel">
      <p class="sect-label">Filters</p>
      <div class="chipbar">
        <span class="chipgroup-label">Strikes</span>
        @for (item of strikeFilters; track item.value) {
          <button
            class="chip"
            type="button"
            [class.active]="strikeFilter === item.value"
            (click)="strikeFilter = item.value"
          >
            {{ item.label }}
          </button>
        }
      </div>
      <div class="chipbar">
        <span class="chipgroup-label">Moneyness</span>
        @for (item of moneyFilters; track item.value) {
          <button
            class="chip"
            type="button"
            [class.active]="moneyFilter === item.value"
            (click)="moneyFilter = item.value"
          >
            {{ item.label }}
          </button>
        }
      </div>
      <div class="chipbar">
        <span class="chipgroup-label">Columns</span>
        @for (item of columnOptions; track item.key) {
          <button
            class="chip"
            type="button"
            [class.active]="columns[item.key]"
            [disabled]="columns[item.key] && visibleColumnCount === 1"
            (click)="toggleColumn(item.key)"
          >
            {{ item.label }}
          </button>
        }
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
                <th class="grouphdr strikehdr">Strike</th>
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
        <svg viewBox="0 0 560 200" role="img" aria-label="Open interest by strike">
          <path [attr.d]="chartPath(view?.chart?.callOi)" class="chart-line call-line"></path>
          <path [attr.d]="chartPath(view?.chart?.putOi)" class="chart-line put-line"></path>
        </svg>
      </div>
      <div class="panel chart-panel">
        <p class="panel-title">Implied Volatility Smile</p>
        <svg viewBox="0 0 560 200" role="img" aria-label="Implied volatility smile">
          <path [attr.d]="chartPath(view?.chart?.callIv)" class="chart-line call-line"></path>
          <path [attr.d]="chartPath(view?.chart?.putIv)" class="chart-line put-line"></path>
        </svg>
      </div>
    </div>
  </section>`,
  styleUrls: ['./options-chain.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OptionsChainComponent implements OnInit, OnDestroy {
  private readonly api = inject(GreeksCalculatorService);
  private readonly chainApi = inject(OptionsChainService);
  private readonly toast = inject(ToastService);
  private readonly cd = inject(ChangeDetectorRef);
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
  ngOnInit(): void {
    this.setupSelection();
    this.loadSymbols();
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
    return this.view?.atmIv ?? this.details?.hv20 ?? null;
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
      this.chainApi
        .getOptionChain({ symbol: this.symbol, expiry: this.expiry })
        .pipe(takeUntil(this.destroy$))
        .subscribe((view) => {
          this.view = view;
          this.rows = view.rows;
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
    if (key === 'iv') return value.iv > 0 ? `${value.iv.toFixed(2)}%` : '—';
    if (key === 'ltp') return value.ltp.toFixed(2);
    if (key === 'delta') return value.delta == null ? '—' : value.delta.toFixed(3);
    if (key === 'gamma') return value.gamma == null ? '—' : value.gamma.toFixed(5);
    if (key === 'theta') return value.theta == null ? '—' : value.theta.toFixed(2);
    return value.vega == null ? '—' : value.vega.toFixed(2);
  }
  barClass(value: number): string {
    const max = Math.max(1, ...this.visibleRows.flatMap((row) => [row.call.oi, row.put.oi]));
    return `bar-${Math.min(10, Math.max(0, Math.round((value / max) * 10)))}`;
  }
  chartPath(points: Array<{ x: number; y: number }> | undefined): string {
    if (!points || points.length < 2) return '';
    const xs = points.map((point) => point.x),
      ys = points.map((point) => point.y),
      minX = Math.min(...xs),
      maxX = Math.max(...xs),
      minY = Math.min(...ys),
      maxY = Math.max(...ys);
    return points
      .map((point, index) => {
        const x = 10 + ((point.x - minX) / (maxX - minX || 1)) * 540;
        const y = 190 - ((point.y - minY) / (maxY - minY || 1)) * 170;
        return `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }
  formatPrice(value: number): string {
    return `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  integer(value: number | null): string {
    return value == null ? '—' : Math.round(value).toLocaleString('en-IN');
  }
  decimal(value: number | null): string {
    return value == null ? '—' : value.toFixed(2);
  }
  upgrade(): void {
    this.toast.success('Live chain is available with a Premium subscription.');
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
  private loadSymbols(): void {
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
