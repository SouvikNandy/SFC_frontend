/* Types for the Portfolio API (docs: "SFC Advisor — Portfolio API Reference") and the Portfolio Analysis screen. */

export type Segment = 'FUT' | 'OPT';
export type SegmentFilter = 'all' | Segment;
export type OptionKind = 'CE' | 'PE';
export type FillSide = 'Buy' | 'Sell';
export type Direction = 'LONG' | 'SHORT';
export type PeriodGroup = 'trade' | 'day' | 'week' | 'month';
export type PortfolioView = 'open' | 'closed' | 'perf' | 'basket';
export type PriceSource = 'eod' | 'live';
export type FillAction = 'opened' | 'added' | 'reduced' | 'closed' | 'flipped';

/* ---------- response envelope ---------- */

export interface ApiEnvelope<T> {
    success: boolean;
    message: string;
    data: T;
    timestamp?: string;
    path?: string;
    /** Field problems keyed by field name; business-rule problems are keyed `detail` (or `name`). */
    errors?: Record<string, string[]>;
    error_code?: number;
}

/* ---------- shared objects ---------- */

/** A position row. Money is a string; `cmp`/`unrealised` are null until an end-of-day price exists. */
export interface PortfolioPosition {
    id: string;
    add_date?: string;
    segment: Segment;
    symbol: string;
    label: string;
    /** "" for futures. */
    type: OptionKind | '';
    strike: string | null;
    expiry_date: string;
    basket: string | null;
    basket_name: string | null;
    side: FillSide;
    direction: Direction;
    /** Lots (units = qnt × lot_size). */
    qnt: number;
    open_price: string;
    date: string;
    lot_size: number;
    avg_cost: string;
    cmp: string | null;
    notional: string;
    unrealised: string | null;
    realised: string | null;
    closing_price: string | null;
    close_date: string | null;
    /** Open rows from /open-list and /baskets only; negative once expired. */
    dte?: number;
    /** Set by the UI, never the API: `cmp`/`unrealised` were filled from an EOD close because the API had none. */
    cmp_source?: 'eod';
    /** Session date of that EOD close, YYYY-MM-DD. */
    cmp_date?: string;
}

export interface PortfolioSummary {
    open_positions: number;
    priced: number;
    notional: number;
    unrealised: number;
    realised: number;
    total: number;
    closed_trades: number;
}

/* ---------- requests ---------- */

export interface AddFillRequest {
    segment: Segment;
    symbol: string;
    /** OPT only. */
    type?: OptionKind;
    /** OPT only; decimal as a string, e.g. "24500.00". */
    strike?: string;
    expiry_date: string;
    side: FillSide;
    qnt: number;
    open_price: string;
    date: string;
    lot_size: number;
    /** Either basket_id or basket_name, never both. */
    basket_id?: string;
    basket_name?: string;
}

export interface SquareOffRequest {
    id: string;
    closing_price: string;
    /** Omit to close every open lot. */
    qnt?: number;
}

export type OpenSortKey = 'symbol' | 'qnt' | 'avg_cost' | 'cmp' | 'notional' | 'unrealised';
export type ClosedSortKey = 'symbol' | 'qnt' | 'avg_cost' | 'closing_price' | 'realised' | 'close_date';
export type SortDir = 'asc' | 'desc';

export interface OpenListRequest {
    segment?: SegmentFilter;
    sort_by?: OpenSortKey;
    sort_dir?: SortDir;
}

export interface ClosedListRequest {
    group?: PeriodGroup;
    sort_by?: ClosedSortKey;
    sort_dir?: SortDir;
    page?: number;
    page_size?: number;
}

export interface PerformanceRequest {
    group?: PeriodGroup;
    date_from?: string;
    date_to?: string;
}

export interface BasketsRequest {
    closed_limit?: number;
}

export interface BasketChartRequest {
    id: string;
    days?: number;
}

export interface BasketRenameRequest {
    id: string;
    name: string;
}

export interface BasketRemoveRequest {
    id: string;
}

/* ---------- responses (the envelope's `data`) ---------- */

export interface AddFillData {
    action: FillAction;
    realised: string;
    /** Open position left after the fill; null after a full close. */
    position: PortfolioPosition | null;
    closed_trades: PortfolioPosition[];
}

export interface SquareOffData {
    realised: string;
    closed_trade: PortfolioPosition;
    /** Open lots remaining; null after a full square-off. */
    position: PortfolioPosition | null;
}

export interface OpenListData {
    summary: PortfolioSummary;
    segment_counts: { all: number; FUT: number; OPT: number };
    expiring_soon: number;
    results: PortfolioPosition[];
}

export interface ClosedTotals {
    closed_trades: number;
    profitable: number;
}

export interface ClosedTradesData {
    group: 'trade';
    summary: PortfolioSummary;
    totals: ClosedTotals;
    results: PortfolioPosition[];
    page: number;
    has_next: boolean;
    has_previous: boolean;
}

export interface PeriodRow {
    key: string;
    start: string;
    end: string;
    trades: number;
    wins: number;
    win_rate: number;
    realised: number;
}

export interface ClosedPeriodsData {
    group: 'day' | 'week' | 'month';
    summary: PortfolioSummary;
    totals: ClosedTotals;
    results: PeriodRow[];
}

export type ClosedListData = ClosedTradesData | ClosedPeriodsData;

export interface MaxDrawdown {
    amount: number;
    pct: number | null;
    peak_date: string | null;
    trough_date: string | null;
}

export interface PerformanceMetrics {
    trades: number;
    wins: number;
    losses: number;
    win_rate: number;
    gross_profit: number;
    gross_loss: number;
    net: number;
    avg_win: number;
    avg_loss: number;
    largest_win: number;
    largest_loss: number;
    /** null when there are no losses. */
    profit_factor: number | null;
    expectancy: number;
    max_drawdown: MaxDrawdown;
}

export interface CurvePoint {
    index: number;
    /** null for the origin point. */
    key: string | null;
    start?: string;
    end?: string;
    value: number;
    peak: number;
}

export interface PeriodPnl {
    key: string;
    start?: string;
    end?: string;
    /** Absent when group = trade. */
    trades?: number;
    wins?: number;
    value: number;
}

export interface PerformanceData {
    group: PeriodGroup;
    date_from: string | null;
    date_to: string | null;
    /** false only when the user has no closed trades at all. */
    has_closed_trades: boolean;
    summary: PortfolioSummary;
    metrics: PerformanceMetrics;
    curve: CurvePoint[];
    period_pnl: PeriodPnl[];
    by_segment: Partial<Record<Segment, number>>;
}

export interface BasketItem {
    id: string;
    name: string;
    open_count: number;
    closed_count: number;
    unrealised: number;
    realised: number;
    open_positions: PortfolioPosition[];
    closed_trades: PortfolioPosition[];
    closed_trades_truncated: boolean;
}

export interface UnassignedBucket {
    open_count: number;
    unrealised: number;
    open_positions: PortfolioPosition[];
}

export interface BasketsData {
    summary: PortfolioSummary;
    baskets: BasketItem[];
    unassigned: UnassignedBucket;
}

export interface BasketChartRow {
    date: string;
    live: number;
    sq: number;
    day: number;
    cum: number;
}

export interface BasketChartData {
    basket: { id: string; name: string };
    /** Latest EOD date in the market data; null for an empty basket. */
    as_of: string | null;
    rows: BasketChartRow[];
}

export interface BasketRenameData {
    id: string;
    name: string;
}

export interface BasketRemoveData {
    id: string;
    name: string;
    unassigned: number;
}

/* ---------- chart helpers (UI) ---------- */

export interface CurveChartPoint {
    i: number;
    v: number;
    label: string;
    peak?: number;
}

export interface PeriodBar {
    label: string;
    v: number;
}
