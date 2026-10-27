/*
 * Valuation date and days to expiry, shared by every tool that shows or prices an expiry.
 *
 * The valuation date is today's calendar date in India (Asia/Kolkata), NOT the EOD data date. Day counts are
 * pure calendar-date arithmetic (UTC midnights of the two dates), so neither the browser's timezone nor
 * daylight-saving changes can shift the result.
 */
import { formatDisplayDate } from './date-format';

const IST = 'Asia/Kolkata';
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;
const DAY_MS = 86400000;

// Built once: templates read the valuation date on every change-detection pass.
const IST_FORMAT = new Intl.DateTimeFormat('en-US', { timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit' });

/** Today's date in IST as YYYY-MM-DD. `now` is injectable for tests. */
export function istToday(now: Date = new Date()): string {
    const parts = IST_FORMAT.formatToParts(now);
    const part = (type: string) => parts.find(p => p.type === type)?.value ?? '';
    return `${part('year')}-${part('month')}-${part('day')}`;
}

function utcDay(iso: string): number {
    const match = ISO_DATE.exec(iso);
    if (!match) return Number.NaN;
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date.getTime() : Number.NaN;
}

/**
 * Calendar days from the valuation date to the expiry date: 21 Oct → 27 Oct is 6. Zero on expiry day, negative
 * after it, NaN for an invalid date.
 */
export function daysToExpiry(expiry: string, valuationDate: string = istToday()): number {
    return Math.round((utcDay(expiry) - utcDay(valuationDate)) / DAY_MS);
}

/** "27 Oct 2026 · 6 days to expiry · Valuation date 21 Oct 2026" (or just the valuation date if the expiry is unknown). */
export function expiryNote(expiry: string | null | undefined, valuationDate: string = istToday()): string {
    const valuation = `Valuation date ${formatDisplayDate(valuationDate)}`;
    const days = expiry ? daysToExpiry(expiry, valuationDate) : Number.NaN;
    if (!expiry || !Number.isFinite(days)) return valuation;
    return `Expiry ${formatDisplayDate(expiry)} · ${days} ${days === 1 ? 'day' : 'days'} to expiry · ${valuation}`;
}
