const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The listed strike closest to a price. A tie goes to the lower strike. Null when there is no usable price or strike,
 * so a missing price never turns into an arbitrary strike.
 */
export function nearestStrike(strikes: readonly number[] | null | undefined, price: number | null | undefined): number | null {
  if (price === null || price === undefined || !Number.isFinite(price) || price <= 0) return null;
  const listed = (strikes ?? []).filter(strike => Number.isFinite(strike) && strike > 0).sort((a, b) => a - b);
  let best: number | null = null;
  for (const strike of listed) {
    if (best === null || Math.abs(strike - price) < Math.abs(best - price)) best = strike;
  }
  return best;
}

/**
 * The trading sessions on or before `till`, newest first, from the dates the exchange traded.
 * A weekend, holiday or a date without data therefore falls back to the previous session.
 */
export function sessionsOnOrBefore(sessionDates: readonly unknown[] | null | undefined, till: string): string[] {
  if (!ISO_DATE.test(till)) return [];
  const dates = (sessionDates ?? []).map(value => String(value).slice(0, 10)).filter(value => ISO_DATE.test(value) && value <= till);
  return [...new Set(dates)].sort().reverse();
}

/**
 * The backend answers HTTP 422 `"No data available."` (under `underlying` before its price history starts, under `expiry_date` for a date
 * without a snapshot) when it holds no price for a trade date. That is a gap in the data, not a failure of the request. Any other error,
 * including any other 422, is not matched.
 */
export function isNoUnderlyingDataResponse(error: unknown): boolean {
  const { status, error: body } = (error ?? {}) as { status?: number; error?: { errors?: Record<string, unknown> } };
  if (status !== 422) return false;
  return ['underlying', 'expiry_date'].some(key => {
    const messages = body?.errors?.[key];
    return Array.isArray(messages) && messages.length === 1 && messages[0] === 'No data available.';
  });
}
