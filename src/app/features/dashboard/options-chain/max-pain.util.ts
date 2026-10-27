import { OptionsChainRow } from './models/chain.model';

type OiRow = Pick<OptionsChainRow, 'strike'> & { call: { oi: number }; put: { oi: number } };

const oiOf = (value: number): number => (Number.isFinite(value) && value > 0 ? value : 0);

/**
 * Max Pain of one expiry. For each candidate strike K:
 *   payout(K) = Σ over all strikes S of  callOI(S)·max(K − S, 0) + putOI(S)·max(S − K, 0)
 * and Max Pain is the K with the lowest payout. Pass EVERY strike of the expiry, not a filtered view.
 *
 * Missing / non-finite / negative OI counts as 0. Returns null when the chain is empty or has no OI at all
 * (an all-zero chain has no meaningful answer). Ties resolve to the lowest strike.
 */
export function computeMaxPain(rows: readonly OiRow[]): number | null {
    const strikes = rows.filter(row => Number.isFinite(row.strike) && row.strike > 0);
    if (!strikes.some(row => oiOf(row.call.oi) > 0 || oiOf(row.put.oi) > 0)) return null;

    let best: number | null = null;
    let bestPayout = Number.POSITIVE_INFINITY;
    for (const candidate of strikes) {
        const k = candidate.strike;
        let payout = 0;
        for (const row of strikes) {
            payout += oiOf(row.call.oi) * Math.max(k - row.strike, 0) + oiOf(row.put.oi) * Math.max(row.strike - k, 0);
        }
        if (payout < bestPayout || (payout === bestPayout && best !== null && k < best)) {
            bestPayout = payout;
            best = k;
        }
    }
    return best;
}
