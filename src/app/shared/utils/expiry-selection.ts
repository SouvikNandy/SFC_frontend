const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Valid YYYY-MM-DD strings only, unique and ascending. Anything else the API sends is ignored, never repaired. */
export function cleanDates(values: readonly unknown[] | null | undefined): string[] {
  const dates = (values ?? []).map(value => String(value).slice(0, 10)).filter(value => ISO_DATE.test(value));
  return [...new Set(dates)].sort();
}

/**
 * The expiries offered for a date range, from the dates the backend lists (`/fo/dd_expiry`): every listed expiry from `from`
 * to `till`, inclusive, weekly and monthly alike. Nothing outside the range is added and nothing is classified or inferred.
 * The result is unique and ascending. No system date is involved.
 */
export function selectExpiries(listed: readonly unknown[] | null | undefined, from: string, till: string): string[] {
  if (!ISO_DATE.test(from) || !ISO_DATE.test(till)) return [];
  return cleanDates(listed).filter(date => date >= from && date <= till);
}

/** The default pick: the most recent expiry inside the range; with none there, the earliest option. Undefined for an empty list. */
export function defaultExpiry(options: readonly string[], from: string, till: string): string | undefined {
  return options.filter(option => option >= from && option <= till).at(-1) ?? options[0];
}

/**
 * The backend answers HTTP 422 with `errors.expiry_date: ["No data available."]` when no expiry is listed for the dates asked for.
 * That is an empty result, not a failure. Any other error, including any other 422, is not matched.
 */
export function isNoExpiriesResponse(error: unknown): boolean {
  const { status, error: body } = (error ?? {}) as { status?: number; error?: { errors?: { expiry_date?: unknown } } };
  const messages = body?.errors?.expiry_date;
  return status === 422 && Array.isArray(messages) && messages.length === 1 && messages[0] === 'No data available.';
}
