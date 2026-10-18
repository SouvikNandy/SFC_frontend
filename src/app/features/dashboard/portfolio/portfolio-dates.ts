/* Date helpers for Portfolio Analysis. Dates are YYYY-MM-DD strings handled in UTC (no timezone off-by-one). */
import { PeriodGroup } from './models/portfolio.model';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: string): boolean {
    const match = DATE_RE.exec(value);
    if (!match) return false;
    const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** 12 Oct 2026 */
export function dateLabel(value: string): string {
    if (!isIsoDate(value)) return value;
    const [y, m, d] = value.split('-').map(Number);
    return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** The local calendar day as YYYY-MM-DD. */
export function todayIso(now: Date = new Date()): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Label for an API period key: a day, a week start (Monday), a month (YYYY-MM) or anything else as given. */
export function periodKeyLabel(key: string | null, group: PeriodGroup, end?: string): string {
    if (!key) return '';
    if (/^\d{4}-\d{2}$/.test(key)) {
        const [y, m] = key.split('-').map(Number);
        return `${MONTHS[m - 1]} ${y}`;
    }
    if (isIsoDate(key)) return group === 'week' && end ? `${dateLabel(key)} – ${dateLabel(end)}` : dateLabel(key);
    return key;
}
