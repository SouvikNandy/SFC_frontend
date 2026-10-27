import { PricingInputs, solveIvInContext } from './contract-iv';

export interface AtmIv {
    strike: number;
    /** Percent; null when that side's Close (EOD) yields no implied volatility. */
    callPct: number | null;
    putPct: number | null;
    /** Mean of the sides that solved. */
    averagePct: number;
}

/**
 * At-the-money implied volatility of one expiry: the strike nearest the pricing underlying (lower strike on a tie) whose
 * call or put Close (EOD) yields an implied volatility, averaging the sides that solve. Returns null when no strike does
 * (including when there is no time to expiry); no other volatility is ever substituted.
 */
export function atmImpliedVolatility(
    inputs: PricingInputs,
    rows: ReadonlyArray<{ strike: number; callClose: number | null | undefined; putClose: number | null | undefined }>,
    days: number,
): AtmIv | null {
    const nearestFirst = rows
        .filter(row => Number.isFinite(row.strike) && row.strike > 0)
        .slice()
        .sort((a, b) => Math.abs(a.strike - inputs.underlying) - Math.abs(b.strike - inputs.underlying) || a.strike - b.strike);
    for (const row of nearestFirst) {
        const call = solveIvInContext(inputs, { side: 'call', strike: row.strike, days, close: row.callClose });
        const put = solveIvInContext(inputs, { side: 'put', strike: row.strike, days, close: row.putClose });
        const callPct = call.ok ? call.ivPct : null;
        const putPct = put.ok ? put.ivPct : null;
        const solved = [callPct, putPct].filter((value): value is number => value !== null);
        if (solved.length) return { strike: row.strike, callPct, putPct, averagePct: solved.reduce((sum, value) => sum + value, 0) / solved.length };
    }
    return null;
}
