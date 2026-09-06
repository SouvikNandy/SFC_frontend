export interface GreeksSymbolListResponse {
    success: boolean;
    message?: string;
    data?: string[];
    SYMBOL_LIST?: string[];
}

export interface GreeksSymbolDetailsRequest {
    symbol: string;
}

export interface GreeksSymbolDetails {
    symbol: string;
    trade_date: string;
    expiry_date: string | number | Array<string | number>;
    expiry_days?: number;
    expiry?: number;
    underlying: number;
    strike: number[];
    atm_strike: number;
    hv20: number;

    market_price?: {
        CE: number;
        PE: number;
    };
}

export interface GreeksSymbolDetailsResponse {
    success: boolean;
    message?: string;
    data?: GreeksSymbolDetails;
    timestamp?: string;
    path?: string;
}