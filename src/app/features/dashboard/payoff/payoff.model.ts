import { GreeksSymbolDetails } from '../greeks/greeks.model';

export type PayoffMode = 'custom' | 'eod' | 'live';
export type PayoffView = 'graph' | 'table';
export type OptionType = 'call' | 'put';
export type LegDirection = 'long' | 'short';

export type PayoffStrategy =
    | 'long_call' | 'long_put' | 'short_call' | 'short_put'
    | 'bull_call_spread' | 'bear_put_spread'
    | 'long_straddle' | 'long_strangle' | 'butterfly' | 'iron_condor'
    | 'call_calendar' | 'put_calendar' | 'diagonal_call' | 'double_calendar' | 'double_diagonal'
    | 'custom_position';

/* ---------- EOD option prices per expiry (from /tools/options-chain) ---------- */

/** CE/PE price for one strike of one expiry; null when the chain has no price for that side. */
export interface PayoffQuote {
    strike: number;
    ce: number | null;
    pe: number | null;
}

export type ExpiryQuoteStatus = 'loading' | 'ready' | 'error';

/** Quotes for one expiry of the selected symbol (the prototype's chain for a given expiryDays). */
export interface ExpiryQuotes {
    status: ExpiryQuoteStatus;
    byStrike: ReadonlyMap<number, PayoffQuote>;
    callStrikes: number[];
    putStrikes: number[];
}

/** `/fo/dd_symbol_details` also returns `lot`, which the shared Greeks model does not declare. */
export interface PayoffSymbolDetails extends GreeksSymbolDetails {
    lot?: number | null;
}

export interface PayoffExpiry {
    days: number;
    date: Date;
    /** Expiry as returned by the API (YYYY-MM-DD), used to request that expiry's chain. */
    iso: string;
}

/* ---------- position ---------- */

export interface PayoffLeg {
    id: number;
    type: OptionType;
    direction: LegDirection;
    strike: number;
    /** null when the data feed has no settlement price for this contract. */
    premium: number | null;
    quantity: number;
    expiryDays: number;
    lotSize: number;
}

export interface PricedLeg extends PayoffLeg {
    premium: number;
}

export interface PayoffInputs {
    legs: PricedLeg[];
    spot: number;
    /** Base volatility in percent. */
    vol: number;
    /** Implied-vol slider value; 100 = ×1.00. */
    ivMultiplier: number;
    /** Price-range slider value in percent either side of spot. */
    rangePct: number;
    /** Evaluation date as days after the base date. */
    evalDay: number;
    baseDate: Date;
    narrow: boolean;
}

/* ---------- calculated dataset ---------- */

export interface PayoffCurvePoint {
    price: number;
    pnl: number;
}

export type ProfitZone = [number, number];

export interface HeatCell {
    pnl: number;
    positive: boolean;
    /** Intensity bucket 0–10 relative to the largest |P&L| in the grid. */
    level: number;
    strong: boolean;
}

export interface HeatColumn {
    days: number;
    date: Date;
    isExpiry: boolean;
}

export interface HeatRow {
    price: number;
    movePct: number;
    isSpot: boolean;
    cells: HeatCell[];
}

export interface PayoffHeatmap {
    columns: HeatColumn[];
    rows: HeatRow[];
}

export interface PayoffMetrics {
    netPremium: number;
    maxProfit: number;
    maxLoss: number;
    profitUnlimited: boolean;
    lossUnlimited: boolean;
    chanceOfProfit: number;
    zones: ProfitZone[];
}

export interface PayoffResult {
    near: number;
    far: number;
    isCalendar: boolean;
    usedExpiries: number[];
    evalDay: number;
    effVol: number;
    lo: number;
    hi: number;
    curveExpiry: PayoffCurvePoint[];
    curveEval: PayoffCurvePoint[];
    breakevens: number[];
    densities: number[];
    metrics: PayoffMetrics;
    heatmap: PayoffHeatmap;
}

/* ---------- SVG geometry ---------- */

export interface ChartLine { x1: number; y1: number; x2: number; y2: number; }
export interface ChartLabel { x: number; y: number; text: string; anchor: 'start' | 'middle' | 'end'; }

export interface PayoffChartPoint {
    price: number;
    x: number;
    pnlExpiry: number;
    pnlEval: number;
    yExpiry: number;
    yEval: number;
}

export interface PayoffChart {
    width: number;
    height: number;
    viewBox: string;
    fontSize: number;
    padLeft: number;
    padTop: number;
    plotWidth: number;
    plotBottom: number;
    zeroY: number;
    gridLines: ChartLine[];
    yLabels: ChartLabel[];
    xLabels: ChartLabel[];
    densityPath: string;
    profitPath: string;
    lossPath: string;
    expiryPath: string;
    evalPath: string | null;
    breakevenLines: ChartLine[];
    breakevenLabels: ChartLabel[];
    strikeMarks: ChartLine[];
    spotX: number;
    points: PayoffChartPoint[];
}

export type LadderTone = 'long-call' | 'long-put' | 'short-call' | 'short-put';

export interface LadderPill {
    key: string;
    label: string;
    tone: LadderTone;
    near: boolean;
    x: number;
    cx: number;
    y: number;
    width: number;
    height: number;
    textY: number;
    connector: string;
    badgeX: number;
    badgeY: number;
    badgeWidth: number;
    badgeHeight: number;
    badgeTextY: number;
    badgeText: string;
}

export interface PayoffLadder {
    viewBox: string;
    axisY: number;
    axisX1: number;
    axisX2: number;
    ticks: Array<ChartLine & { major: boolean }>;
    labels: ChartLabel[];
    spotMarker: string;
    pills: LadderPill[];
    tickFont: number;
    pillFont: number;
    badgeFont: number;
}
