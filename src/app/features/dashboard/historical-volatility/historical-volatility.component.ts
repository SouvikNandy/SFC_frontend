import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DataTableComponent } from '../../../shared/components/data-table/data-table.component';
import { DataTableColumn } from '../../../shared/components/data-table/data-table.types';
import { HistoricalVolatilityService } from './historical-volatility.service';
import {
  HistoricalVolatilityChart,
  HistoricalVolatilityInstrumentKey,
  HistoricalVolatilityMode,
  HistoricalVolatilityRow,
} from './historical-volatility.model';

@Component({
  selector: 'app-historical-volatility',
  imports: [DataTableComponent],
  templateUrl: './historical-volatility.component.html',
  styleUrl: './historical-volatility.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistoricalVolatilityComponent {
  private readonly volatility = inject(HistoricalVolatilityService);

  readonly instruments = this.volatility.getInstrumentOptions();
  readonly columns: DataTableColumn<HistoricalVolatilityRow>[] = [
    { key: 'date', label: 'Date' },
    { key: 'close', label: 'Close', formatter: value => this.formatClose(value) },
    { key: 'dailyReturn', label: 'Daily return', type: 'change', formatter: value => this.formatReturn(value) },
    { key: 'hv10', label: 'HV-10', formatter: value => this.formatVolatility(value) },
    {
      key: 'hv20',
      label: 'HV-20',
      formatter: value => this.formatVolatility(value),
      rowClass: row => row.isAsOf ? 'historical-volatility__as-of' : '',
    },
  ];

  mode: HistoricalVolatilityMode = 'eod';
  instrument: HistoricalVolatilityInstrumentKey = 'nifty';
  series = this.volatility.loadSeries(this.instrument);
  selectedIndex = this.series.length - 1;
  rows: HistoricalVolatilityRow[] = [];
  chart: HistoricalVolatilityChart = this.buildChart();
  liveUpgradeRequested = false;
  error = '';

  constructor() {
    this.recalculate();
  }

  selectMode(mode: HistoricalVolatilityMode): void {
    this.mode = mode;
    if (mode === 'eod') this.loadInstrument(this.instrument);
  }

  loadInstrument(key: HistoricalVolatilityInstrumentKey): void {
    this.instrument = key;
    this.series = this.volatility.loadSeries(key);
    this.selectedIndex = this.series.length - 1;
    this.error = '';
    this.recalculate();
  }

  selectInstrument(event: Event): void {
    const key = (event.target as HTMLSelectElement).value as HistoricalVolatilityInstrumentKey;
    if (this.instruments.some(option => option.key === key)) this.loadInstrument(key);
  }

  selectDate(event: Event): void {
    const index = Number((event.target as HTMLSelectElement).value);
    if (!Number.isInteger(index) || index < 0 || index >= this.series.length) return;
    this.selectedIndex = index;
    this.recalculate();
  }

  requestUpgrade(): void {
    this.liveUpgradeRequested = true;
  }

  private recalculate(): void {
    this.error = this.series.length < 21
      ? `Need at least 21 daily closes to compute HV-20 (currently have ${this.series.length}). Load more data.`
      : '';
    const returns = this.volatility.calculateReturns(this.series);
    const hv10 = this.series.map((_point, index) => this.volatility.rollingVolatility(returns, index, 10));
    const hv20 = this.series.map((_point, index) => this.volatility.rollingVolatility(returns, index, 20));
    this.rows = this.series.map((point, index) => ({
      date: point.date,
      close: point.close,
      dailyReturn: returns[index],
      hv10: hv10[index],
      hv20: hv20[index],
      isAsOf: index === this.selectedIndex,
    })).reverse();
    this.chart = this.buildChart(hv10, hv20);
  }

  private buildChart(hv10: Array<number | null> = [], hv20: Array<number | null> = []): HistoricalVolatilityChart {
    const width = 900;
    const height = 260;
    const paddingLeft = 46;
    const paddingRight = 46;
    const paddingTop = 10;
    const paddingBottom = 24;
    const plotWidth = width - paddingLeft - paddingRight;
    const plotHeight = height - paddingTop - paddingBottom;
    const closes = this.series.map(point => point.close);
    const priceMin = closes.length ? Math.min(...closes) : 0;
    const priceMax = closes.length ? Math.max(...closes) : 1;
    const priceRange = priceMax - priceMin || 1;
    const volatilityValues = [...hv10, ...hv20].filter((value): value is number => value !== null);
    const volatilityMin = volatilityValues.length ? Math.min(...volatilityValues) : 0;
    const volatilityMax = volatilityValues.length ? Math.max(...volatilityValues) : 1;
    const volatilityRange = volatilityMax - volatilityMin || 1;
    const xAt = (index: number) => this.series.length <= 1 ? paddingLeft : paddingLeft + index * plotWidth / (this.series.length - 1);
    const yPriceAt = (value: number) => paddingTop + plotHeight - (value - priceMin) / priceRange * plotHeight;
    const yVolatilityAt = (value: number) => paddingTop + plotHeight - (value - volatilityMin) / volatilityRange * plotHeight;
    const gridLines = [0, 1, 2].map(step => {
      const fraction = step / 2;
      return {
        y: paddingTop + plotHeight * fraction,
        priceLabel: (priceMax - fraction * (priceMax - priceMin)).toFixed(0),
        volatilityLabel: `${(volatilityMax - fraction * (volatilityMax - volatilityMin)).toFixed(1)}%`,
      };
    });
    const xLabels = (this.series.length > 1 ? [0, Math.floor((this.series.length - 1) / 2), this.series.length - 1] : [0])
      .map(index => ({ x: xAt(index), label: this.series[index].date }));
    const marker = this.selectedIndex >= 0 && this.selectedIndex < this.series.length
      ? { x: xAt(this.selectedIndex), y: yPriceAt(closes[this.selectedIndex]) }
      : null;

    return {
      pricePath: this.pathFor(closes, xAt, yPriceAt),
      hv10Path: this.pathFor(hv10, xAt, yVolatilityAt),
      hv20Path: this.pathFor(hv20, xAt, yVolatilityAt),
      gridLines,
      xLabels,
      marker,
      viewBox: `0 0 ${width} ${height}`,
    };
  }

  private pathFor(values: Array<number | null>, xAt: (index: number) => number, yAt: (value: number) => number): string {
    let path = '';
    let drawing = false;
    values.forEach((value, index) => {
      if (value === null) {
        drawing = false;
        return;
      }
      path += `${drawing ? 'L' : 'M'}${xAt(index).toFixed(1)},${yAt(value).toFixed(1)} `;
      drawing = true;
    });
    return path.trim();
  }

  private formatClose(value: unknown): string {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? `₹${numericValue.toLocaleString('en-IN')}` : '—';
  }

  private formatReturn(value: unknown): string {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? `${numericValue >= 0 ? '+' : ''}${(numericValue * 100).toFixed(2)}%` : '—';
  }

  private formatVolatility(value: unknown): string {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? `${numericValue.toFixed(2)}%` : '—';
  }

  get selectedDate(): string { return this.series[this.selectedIndex]?.date ?? ''; }
  get hv10Value(): number | null { return this.valueForWindow(10); }
  get hv20Value(): number | null { return this.valueForWindow(20); }
  get instrumentLabel(): string { return this.volatility.getInstrument(this.instrument).label; }

  formatMetric(value: number | null): string { return value === null ? '—' : `${value.toFixed(2)}%`; }

  metricMeta(value: number | null, window: number): string {
    return value === null ? `Need ${window + 1} closes ending on this date` : `${window}-day realised volatility, annualised, as of ${this.selectedDate}`;
  }

  private valueForWindow(window: number): number | null {
    return this.volatility.rollingVolatility(this.volatility.calculateReturns(this.series), this.selectedIndex, window);
  }
}
