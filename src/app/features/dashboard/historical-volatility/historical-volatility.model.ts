export type HistoricalVolatilityMode = 'eod' | 'live';

export interface HistoricalVolatilityRequest {
    symbol: string;
    date: string;
}

export interface SymbolListResponse {
    success: boolean;
    message?: string;
    data?: string[];
    SYMBOL_LIST?: string[];
}

export interface HistoricalVolatilityApiRow {
    trade_date: string;
    symbol: string;
    close_price: number;
    hv10: number | null;
    hv20: number | null;
    daily_return: number | null;
}

export interface HistoricalVolatilityResponse {
    success: boolean;
    message?: string;
    data?: HistoricalVolatilityApiRow[];
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
