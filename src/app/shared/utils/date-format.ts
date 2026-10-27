/* Display date formatting with a fixed three-letter month ("Sep", never the locale's "Sept"). */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ISO_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * "28 Sep 2027" (or "28 Sep" without the year) for a YYYY-MM-DD string or any value `Date` can parse.
 * ISO dates are read as written, so no timezone shift. Unparseable input is returned unchanged.
 */
export function formatDisplayDate(value: unknown, withYear = true): string {
    const text = String(value);
    const iso = ISO_PREFIX.exec(text);
    let year: number, month: number, day: number;
    if (iso) {
        [year, month, day] = [Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])];
    } else {
        const date = new Date(text);
        if (Number.isNaN(date.getTime())) return text;
        [year, month, day] = [date.getFullYear(), date.getMonth(), date.getDate()];
    }
    // Reject impossible dates (month 13, 31 Sep, 29 Feb in a non-leap year) instead of displaying them.
    const check = new Date(Date.UTC(year, month, day));
    if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month || check.getUTCDate() !== day) return text;
    const label = `${String(day).padStart(2, '0')} ${MONTHS[month]}`;
    return withYear ? `${label} ${year}` : label;
}
