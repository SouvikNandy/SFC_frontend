/*
 * Disclaimer wording, exactly as given in the client's developer change list (24 Oct 2026, item 6).
 * Do not paraphrase or reflow: legal text changes only on the client's instruction.
 * The footer shows the first paragraph; the /disclaimer page shows both.
 */
export const DISCLAIMER_SUMMARY =
    'SFC Quant is a market-analytics platform for Indian equities. It is not investment advice, and we are not registered with SEBI as an investment adviser or research analyst. Backtests are hypothetical, and past performance does not predict future results.';

export const DISCLAIMER_TRADING_LOSSES =
    '9 out of 10 individual traders in the equity Futures and Options segment incurred net losses. On average, loss makers registered a net trading loss close to ₹50,000. Over and above the net trading losses incurred, loss makers expended an additional 28% of net trading losses as transaction costs. Those making net trading profits incurred between 15% and 50% of such profits as transaction costs.';

export const DISCLAIMER_PARAGRAPHS: readonly string[] = [DISCLAIMER_SUMMARY, DISCLAIMER_TRADING_LOSSES];

/** Label of the required acknowledgement on Register; "Disclaimer" in it links to /disclaimer. */
export const DISCLAIMER_ACCEPT_LABEL = 'I have read and accept the Disclaimer';
