export interface EodRequest {
    /** Any F&O symbol from `/fo/dd_list`. */
    symbol: string;
    option_type: 'XX' | 'CE' | 'PE';
    strike?: number;
    expiry?: string;
    date_from: string; // YYYY-MM-DD
    date_till: string; // YYYY-MM-DD
    page: number;
    page_size: number;
}

export type EodSymbol = EodRequest['symbol'];

export interface DdGreeksRequest {
    symbol: EodSymbol;
}

/** `POST /fo/dd_expiry`: the expiries listed for a symbol between two trade dates (YYYY-MM-DD). */
export interface DdExpiryRequest {
    symbol: EodSymbol;
    trade_from: string;
    trade_till: string;
}

export interface DdExpiryResponse {
    success: boolean;
    message?: string;
    data: {
        symbol: string;
        trade_from: string;
        trade_till: string;
        expiry_date: string[];
    };
}

export interface DdGreeksMarketPrice {
    CE: number;
    PE: number;
}

export interface DdGreeksData {
    symbol: string;
    trade_date: string;
    /** Older responses sent one date string; the API now returns every listed expiry as an array. */
    expiry_date: string | string[];
    underlying: number;
    strike: number[];
    atm_strike: number;
    market_price: DdGreeksMarketPrice;
}

export interface DdGreeksResponse {
    success: boolean;
    message?: string;
    data: DdGreeksData;
    timestamp?: string;
    path?: string;
}

export interface EodDataRow {
    date: string; // YYYY-MM-DD
    symbol: string;
    open: number;
    high: number;
    low: number;
    close: number;
    /** Not used for display; the EOD screen shows `close`. */
    ltp?: number;
    volume: number;
    oi: number;
}

export interface EodResponse {
    success: boolean;
    message?: string;
    data: EodPaginatedData;
    timestamp?: string;
    path?: string;
}

export interface EodPaginatedData {
    results: EodDataRow[];
    page: number;
    has_next: boolean;
    has_previous: boolean;
}

/**
 * `/fo/eod/chart` (verified live 2026-10-19): the same filters as `/fo/eod` without paging. `page` / `page_size` are
 * ignored if sent. It answers the whole range in one response, oldest first, with no row cap
 * (1,273 sessions for NIFTY futures over 5.8 years in a single call).
 */
export type EodChartRequest = Omit<EodRequest, 'page' | 'page_size'>;

export interface EodChartPoint {
    date: string; // YYYY-MM-DD
    close: number;
}

/** Envelope `{ success, message: 'EOD_CHART_FETCHED', data: [{ date, close }] }`; an empty `data` array means no sessions. */
export interface EodChartResponse {
    success: boolean;
    message?: string;
    data: EodChartPoint[];
    timestamp?: string;
    path?: string;
}
