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
    ltp: number;
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
