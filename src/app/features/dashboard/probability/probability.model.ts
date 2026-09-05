import { GreeksSymbolDetails } from '../greeks/greeks.model';

export type ProbabilityMode = 'custom' | 'eod' | 'live';

export interface ProbabilityRequest {
    symbol: string;
    spot: number;
    target: number;
    expiry: number;
    iv: number;
}

export interface ProbabilityCurvePoint {
    price: number;
    density: number;
}

export interface ProbabilityApiResults {
    direction: 'above' | 'below' | string;
    probTouchPct: number;
    probExpireBeyondPct: number;
    probExpireAbovePct: number;
    probExpireBelowPct: number;
    expectedPrice: number;
    oneSdUpper: number;
    oneSdLower: number;
    movePct: number;
    moveSd: number;
    d2: number;
    logDrift: number;
    timeYears: number;
}

export interface ProbabilityApiData {
    inputs: {
        spot: number;
        target: number;
        vol: number;
        expiry: number;
        rate: number;
        dividend: number;
        day_count: number;
        trade_date?: string;
        hv_date?: string;
        symbol?: string;
    };
    results: ProbabilityApiResults;
    charts?: {
        curve?: ProbabilityCurvePoint[];
        timeYears?: number;
    };
}

export interface ProbabilityResponse {
    success: boolean;
    message?: string;
    data?: ProbabilityApiData;
    timestamp?: string;
    path?: string;
}

export interface ProbabilityDetailRow {
    label: string;
    description: string;
    value: string;
}

export interface ProbabilityChart {
    viewBox: string;
    curvePath: string;
    shadePath: string;
    targetX: number;
    spotX: number;
    baseY: number;
    xLabels: Array<{ x: number; label: string }>;
}

export type ProbabilitySymbolDetails = GreeksSymbolDetails;
