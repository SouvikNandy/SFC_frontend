/*
 * Wording for the kind of price a tool shows, so every screen names the same price the same way.
 *
 * CLOSE_EOD_LABEL: the EOD row's `close`. The option chain's `c_ltp` / `p_ltp` fields carry this value
 *   (verified against the live API), despite their names.
 * LTP_LABEL: the last traded price: the EOD row's `ltp`, also served as `market_price.CE/PE` by
 *   /fo/dd_symbol_details.
 * "Settle Price (EOD)" is NOT used: no API field has been confirmed to be the settlement price.
 */
export const CLOSE_EOD_LABEL = 'Close (EOD)';
export const LTP_LABEL = 'LTP';
