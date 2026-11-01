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
