export interface MarketCard {
    symbol: string;
    value: string;
    change: string;
    up: boolean;
    direction: 'up' | 'down' | 'flat';
    /** Session the figures belong to, as "DD Mon YYYY"; empty when the API does not say. */
    asOf: string;
}

export interface QuickLink {
    key: string;
    title: string;
    desc: string;
}
