export interface OptionsChainRequest {
    symbol: string;
    expiry: string;
}

export interface OptionsChainApiRow {
    delta?: number | null;
    strike: number;
    c_oi?: number;
    c_oi_chg?: number;
    c_vol?: number;
    c_iv?: number;
    c_ltp?: number;
    c_ltp_chg?: number;
    p_oi?: number;
    p_oi_chg?: number;
    p_vol?: number;
    p_iv?: number;
    p_ltp?: number;
    p_ltp_chg?: number;
}

export interface OptionsChainKeyedRow {
    strike_price: number;
    underlying_price: number;
    c_oi: number;
    c_oi_chg: number;
    c_vol: number;
    c_iv?: number;
    c_ltp: number;
    c_ltp_chg?: number;
    p_oi: number;
    p_oi_chg: number;
    p_vol: number;
    p_iv?: number;
    p_ltp: number;
    p_ltp_chg?: number;
}

export interface OptionsChainChartPoint {
    x: number;
    y: number;
}

export interface OptionsChainApiData {
    spot?: number;
    spot_chg_num?: number;
    spot_chg_per?: number;
    put_call_ratio?: number;
    max_pain?: number;
    call_oi?: number;
    put_oi?: number;
    iv_atm?: number;
    chart?: {
        call_oi?: OptionsChainChartPoint[];
        put_oi?: OptionsChainChartPoint[];
        call_iv?: OptionsChainChartPoint[];
        put_iv?: OptionsChainChartPoint[];
    };
    table?: {
        data?: OptionsChainApiRow[];
    };
    [key: string]: unknown;
}

export interface OptionsChainApiResponse {
    success: boolean;
    message?: string;
    data?: OptionsChainApiData;
    timestamp?: string;
    path?: string;
}

export interface OptionsChainRow {
    strike: number;
    call: OptionsChainSide;
    put: OptionsChainSide;
}

export interface OptionsChainSide {
    oi: number;
    oiChange: number;
    volume: number;
    iv: number;
    ltp: number;
    ltpChange: number;
    delta: number | null;
    gamma: number | null;
    theta: number | null;
    vega: number | null;
    itm: boolean;
}

export interface OptionsChainViewModel {
    spot: number | null;
    spotChange: number | null;
    spotChangePercent: number | null;
    pcr: number | null;
    maxPain: number | null;
    callOi: number | null;
    putOi: number | null;
    atmIv: number | null;
    rows: OptionsChainRow[];
    chart: {
        callOi: OptionsChainChartPoint[];
        putOi: OptionsChainChartPoint[];
        callIv: OptionsChainChartPoint[];
        putIv: OptionsChainChartPoint[];
    };
}
export interface ChainRow {
    strike: number;
    ceLTP: number;
    ceChg: number;
    ceIV: number;
    ceVol: number;
    ceOI: number;
    peLTP: number;
    peChg: number;
    peIV: number;
    peVol: number;
    peOI: number;
}
