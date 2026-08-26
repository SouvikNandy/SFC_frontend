export type HistoricalVolatilityMode = 'eod' | 'live';
export type HistoricalVolatilityInstrumentKey =
    | 'nifty'
    | 'banknifty'
    | 'sensex'
    | 'reliance'
    | 'tcs'
    | 'hdfcbank'
    | 'infosys';

export interface HistoricalVolatilityInstrument {
    label: string;
    spot: number;
    volatility: number;
    seed: number;
}

export interface HistoricalVolatilityPricePoint {
    date: string;
    close: number;
}

export interface HistoricalVolatilityRow {
    date: string;
    close: number;
    dailyReturn: number | null;
    hv10: number | null;
    hv20: number | null;
    isAsOf: boolean;
}

export interface HistoricalVolatilityChart {
    pricePath: string;
    hv10Path: string;
    hv20Path: string;
    gridLines: HistoricalVolatilityGridLine[];
    xLabels: HistoricalVolatilityChartLabel[];
    marker: HistoricalVolatilityMarker | null;
    viewBox: string;
}

export interface HistoricalVolatilityGridLine {
    y: number;
    priceLabel: string;
    volatilityLabel: string;
}

export interface HistoricalVolatilityChartLabel {
    x: number;
    label: string;
}

export interface HistoricalVolatilityMarker {
    x: number;
    y: number;
}
