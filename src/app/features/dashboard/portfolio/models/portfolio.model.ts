export type PositionKind = 'future' | 'option';
export type FillSide = 'buy' | 'sell';
export type OptionKind = 'CE' | 'PE';
export type Direction = 'long' | 'short';
export type SegmentFilter = 'all' | PositionKind;
export type PortfolioView = 'open' | 'closed' | 'perf' | 'basket';
export type PeriodGroup = 'trade' | 'day' | 'week' | 'month';
export type PriceSource = 'eod' | 'live';

/** The contract a fill is booked against, built from underlying + expiry (+ strike and CE/PE for options). */
export interface ContractRef {
    /** Stable identity, e.g. `NIFTY|FUT|2026-10-29` or `NIFTY|OPT|2026-10-29|22600|CE`. */
    key: string;
    label: string;
    kind: PositionKind;
    underlying: string;
    /** YYYY-MM-DD */
    expiry: string;
    strike: number | null;
    optionType: OptionKind | null;
    lot: number;
}

/** One paper-trading ledger entry. Bookkeeping only: it never reaches a broker or an exchange. */
export interface LedgerFill {
    id: string;
    contract: ContractRef;
    side: FillSide;
    /** Lots. */
    qty: number;
    price: number;
    lot: number;
    /** YYYY-MM-DD */
    date: string;
    /** Basket the position is tagged into by this fill; null leaves the position's basket unchanged. */
    basketId: string | null;
}

export interface Basket {
    id: string;
    name: string;
}

/** What is persisted: positions and closed trades are always derived by replaying the fills. */
export interface LedgerSnapshot {
    version: 1;
    fills: LedgerFill[];
    baskets: Basket[];
}

export interface OpenPosition {
    contract: ContractRef;
    kind: PositionKind;
    lot: number;
    /** Signed lots: positive long, negative short. */
    qty: number;
    /** Weighted-average entry price. */
    avg: number;
    opened: string;
    basketId: string | null;
    /** Latest EOD close for the contract; null when no price is available. */
    cmp: number | null;
}

export interface ClosedTrade {
    contract: ContractRef;
    label: string;
    kind: PositionKind;
    direction: Direction;
    qty: number;
    lot: number;
    entry: number;
    exit: number;
    realised: number;
    entryDate: string;
    exitDate: string;
    basketId: string | null;
}

export type FillAction = 'opened' | 'added' | 'reduced' | 'closed' | 'flipped';

export interface FillResult {
    action: FillAction;
    realised: number;
}

export interface DrawdownStats {
    amount: number;
    pct: number | null;
    peakDate: string | null;
    troughDate: string | null;
}

export interface TradeStats {
    trades: number;
    wins: number;
    losses: number;
    winRate: number;
    grossProfit: number;
    grossLoss: number;
    net: number;
    avgWin: number;
    avgLoss: number;
    largestWin: number;
    largestLoss: number;
    profitFactor: number | null;
    expectancy: number;
    dd: DrawdownStats;
}

export interface PeriodSummary {
    key: string;
    trades: number;
    wins: number;
    realised: number;
}

export interface CurvePoint {
    i: number;
    v: number;
    label: string;
}

export interface PeriodBar {
    label: string;
    v: number;
}

/** Daily EOD P&L of one basket, from real EOD closes (see buildBasketEodSeries). */
export interface BasketEodRow {
    date: string;
    live: number;
    squared: number;
    day: number;
    cum: number;
}

/** EOD close history per contract key: date → close. */
export type PriceHistory = ReadonlyMap<string, ReadonlyMap<string, number>>;
