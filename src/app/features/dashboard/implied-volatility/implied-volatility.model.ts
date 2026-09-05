export type ImpliedVolatilityMode = 'custom' | 'eod' | 'live';
export type ImpliedVolatilityOptionType = 'call' | 'put';
export type ImpliedVolatilityPriceSource = 'auto' | 'manual';
export type ImpliedVolatilityStatus = 'ok' | 'low_vega' | 'poor_fit' | 'invalid_input' | 'below_intrinsic' | 'above_maximum' | 'failed';

export interface ImpliedVolatilityTraceStep {
    iteration: number;
    sigma: number;
    price: number;
    residual: number;
    vega: number;
}

export interface ImpliedVolatilityTraceRow {
    step: number;
    volatility: number;
    modelPrice: number;
    residual: number;
    vega: number;
}

export interface ImpliedVolatilityResult {
    ok: boolean;
    status: ImpliedVolatilityStatus;
    message: string;
    method?: 'newton' | 'bisection';
    iterations?: number;
    ivPct?: number;
    theoretical?: number;
    residual?: number;
    vega?: number;
    ivPerTick?: number;
    bounds?: [number, number];
    trace: ImpliedVolatilityTraceStep[];
    badFields?: string[];
}

export interface ImpliedVolatilityChart {
    viewBox: string;
    curvePath: string;
    marketLineY: number;
    solvedLineX: number;
    solvedPoint: { x: number; y: number };
    gridLines: Array<{ y: number; label: string }>;
    xLabels: Array<{ x: number; label: string }>;
    solvedLabel: string;
}
