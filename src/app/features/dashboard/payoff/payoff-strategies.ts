import { DAYS_YEAR } from './payoff-engine';
import { LegDirection, OptionType, PayoffLeg, PayoffStrategy } from './payoff.model';

export const STRATEGY_NAMES: Record<PayoffStrategy, string> = {
    long_call: 'Long Call', long_put: 'Long Put', short_call: 'Short Call', short_put: 'Short Put',
    bull_call_spread: 'Bull Call Spread', bear_put_spread: 'Bear Put Spread', long_straddle: 'Long Straddle',
    long_strangle: 'Long Strangle', butterfly: 'Butterfly', iron_condor: 'Iron Condor', call_calendar: 'Call Calendar',
    put_calendar: 'Put Calendar', diagonal_call: 'Diagonal Call', double_calendar: 'Double Calendar',
    double_diagonal: 'Double Diagonal', custom_position: 'Custom Position',
};

export const STRATEGY_GROUPS: Array<{ label: string; options: Array<{ value: PayoffStrategy; label: string }> }> = [
    { label: 'Single leg', options: [
        { value: 'long_call', label: 'Long call' }, { value: 'long_put', label: 'Long put' },
        { value: 'short_call', label: 'Short call' }, { value: 'short_put', label: 'Short put' }] },
    { label: 'Verticals', options: [
        { value: 'bull_call_spread', label: 'Bull call spread' }, { value: 'bear_put_spread', label: 'Bear put spread' }] },
    { label: 'Volatility', options: [
        { value: 'long_straddle', label: 'Long straddle' }, { value: 'long_strangle', label: 'Long strangle' },
        { value: 'butterfly', label: 'Butterfly' }, { value: 'iron_condor', label: 'Iron condor' }] },
    { label: 'Calendar', options: [
        { value: 'call_calendar', label: 'Call calendar' }, { value: 'put_calendar', label: 'Put calendar' },
        { value: 'diagonal_call', label: 'Diagonal call' }, { value: 'double_calendar', label: 'Double calendar' },
        { value: 'double_diagonal', label: 'Double diagonal' }] },
    { label: 'Custom', options: [{ value: 'custom_position', label: 'Custom' }] },
];

export interface StrategyContext {
    spot: number;
    step: number;
    lotSize: number;
    /** Effective volatility as a decimal (base vol × IV multiplier). */
    sigma: number;
    /** Available expiries in days; empty in Custom mode, where preset days are used directly. */
    expiries: number[];
    existing: PayoffLeg[];
    /** Premium source: API settlement in EOD, Black-Scholes theoretical in Custom. */
    premium: (type: OptionType, strike: number, days: number) => number | null;
    /** Maps a target strike onto a tradable strike (identity in Custom). */
    strike: (target: number, type: OptionType) => number;
    nextId: () => number;
}

/** Nearest listed expiry to the target number of days (prototype: pickExpiry). */
export function pickExpiry(targetDays: number, expiries: number[]): number {
    if (!expiries.length) return targetDays;
    return expiries.reduce((best, days) => (Math.abs(days - targetDays) < Math.abs(best - targetDays) ? days : best), expiries[0]);
}

/** Double calendar / diagonal wing distance: 0.8 s.d. to expiry, rounded to the strike step. */
export function wingOffset(spot: number, step: number, days: number, sigma: number): number {
    const sd = spot * sigma * Math.sqrt(days / DAYS_YEAR);
    const offset = Math.round(0.8 * sd / step) * step;
    return Number.isFinite(offset) ? Math.max(step, offset) : step;
}

export function buildStrategy(name: PayoffStrategy, ctx: StrategyContext): PayoffLeg[] {
    const { spot, step } = ctx;
    const atm = Math.round(spot / step) * step;
    const near = pickExpiry(16, ctx.expiries);
    const far = pickExpiry(near + 7, ctx.expiries);
    const leg = (type: OptionType, target: number, direction: LegDirection, days = near, quantity = 1): PayoffLeg => {
        const strike = ctx.strike(target, type);
        return { id: ctx.nextId(), type, direction, strike, premium: ctx.premium(type, strike, days), quantity, expiryDays: days, lotSize: ctx.lotSize };
    };
    switch (name) {
        case 'long_call': return [leg('call', atm, 'long')];
        case 'long_put': return [leg('put', atm, 'long')];
        case 'short_call': return [leg('call', atm, 'short')];
        case 'short_put': return [leg('put', atm, 'short')];
        case 'bull_call_spread': return [leg('call', atm, 'long'), leg('call', atm + 2 * step, 'short')];
        case 'bear_put_spread': return [leg('put', atm, 'long'), leg('put', atm - 2 * step, 'short')];
        case 'long_straddle': return [leg('call', atm, 'long'), leg('put', atm, 'long')];
        case 'long_strangle': return [leg('call', atm + 2 * step, 'long'), leg('put', atm - 2 * step, 'long')];
        case 'butterfly': return [leg('call', atm - 2 * step, 'long'), leg('call', atm, 'short', near, 2), leg('call', atm + 2 * step, 'long')];
        case 'iron_condor': return [leg('put', atm - 4 * step, 'long'), leg('put', atm - 2 * step, 'short'),
            leg('call', atm + 2 * step, 'short'), leg('call', atm + 4 * step, 'long')];
        case 'call_calendar': return [leg('call', atm, 'short', near), leg('call', atm, 'long', far)];
        case 'put_calendar': return [leg('put', atm, 'short', near), leg('put', atm, 'long', far)];
        case 'diagonal_call': return [leg('call', atm + step, 'short', near), leg('call', atm, 'long', far)];
        case 'double_calendar': {
            const o = wingOffset(spot, step, near, ctx.sigma);
            return [leg('put', atm - o, 'short', near), leg('put', atm - o, 'long', far),
                leg('call', atm + o, 'short', near), leg('call', atm + o, 'long', far)];
        }
        case 'double_diagonal': {
            const o = wingOffset(spot, step, near, ctx.sigma);
            return [leg('put', atm - o, 'short', near), leg('put', atm - o - step, 'long', far),
                leg('call', atm + o, 'short', near), leg('call', atm + o + step, 'long', far)];
        }
        case 'custom_position':
            return ctx.existing.length ? ctx.existing.map(existing => ({ ...existing })) : [leg('call', atm, 'long')];
    }
}

/** Most common spacing between listed strikes around spot. */
export function deriveStrikeStep(strikes: number[], spot: number): number {
    const pick = (list: number[]) => {
        const counts = new Map<number, number>();
        for (let i = 1; i < list.length; i++) {
            const diff = Math.round((list[i] - list[i - 1]) * 100) / 100;
            if (diff > 0) counts.set(diff, (counts.get(diff) ?? 0) + 1);
        }
        let best = 0, bestCount = 0;
        counts.forEach((count, diff) => {
            if (count > bestCount || (count === bestCount && diff < best)) { best = diff; bestCount = count; }
        });
        return best;
    };
    const near = strikes.filter(strike => Math.abs(strike / spot - 1) <= 0.15);
    return pick(near) || pick(strikes) || defaultStrikeStep(spot);
}

/** Custom mode without a loaded chain: a 1-2-5 step close to 0.2% of spot. */
export function defaultStrikeStep(spot: number): number {
    const raw = Math.max(spot * 0.002, 0.01);
    const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
    const nice = [1, 2, 5, 10].map(f => f * magnitude);
    return nice.reduce((best, value) => (Math.abs(value - raw) < Math.abs(best - raw) ? value : best), nice[0]);
}
