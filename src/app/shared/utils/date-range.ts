/*
 * Custom date-range limits for the EOD screens. Dates are YYYY-MM-DD strings handled in UTC, so a timezone can
 * never shift a day. A range may span at most one calendar year, inclusive: 2025-10-18 to 2026-10-18 is allowed,
 * 2025-10-17 to 2026-10-18 is not.
 */

export const MAX_RANGE_MESSAGE = 'Date range cannot exceed one year. Choose a From and To date within one year of each other.';

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: string): boolean {
    const match = DATE_RE.exec(value);
    if (!match) return false;
    const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

const toIso = (date: Date): string =>
    `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;

/** The user's local calendar day as YYYY-MM-DD (never via toISOString, which shifts the day east of UTC). */
export function localTodayIso(now: Date = new Date()): string {
    return toIso(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
}

/** The same calendar date one year later; 29 Feb falls back to 28 Feb in a non-leap year. */
export function plusOneYear(value: string): string {
    const [y, m, d] = value.split('-').map(Number);
    const next = new Date(Date.UTC(y + 1, m - 1, d));
    // 29 Feb + 1 year overflows into March: clamp to the last day of the intended month.
    return next.getUTCMonth() !== m - 1 ? toIso(new Date(Date.UTC(y + 1, m, 0))) : toIso(next);
}

/** The earliest From date that keeps a range ending on `value` within one year (29 Feb − 1 year rolls to 1 Mar). */
export function minusOneYear(value: string): string {
    const [y, m, d] = value.split('-').map(Number);
    return toIso(new Date(Date.UTC(y - 1, m - 1, d)));
}

/** True when both dates are valid and To is later than From + 1 year. Invalid or missing dates are not "too long". */
export function exceedsOneYear(from: string, till: string): boolean {
    return isIsoDate(from) && isIsoDate(till) && till > plusOneYear(from);
}

/** `min` for the From picker: nothing earlier than one year before the To date (none while To is blank or invalid). */
export function fromPickerMin(till: string): string | null {
    return isIsoDate(till) ? minusOneYear(till) : null;
}

/** `max` for the To picker: one year after From, never beyond `today` (`today` alone while From is blank or invalid). */
export function tillPickerMax(from: string, today: string): string {
    if (!isIsoDate(from)) return today;
    const limit = plusOneYear(from);
    return limit < today ? limit : today;
}
