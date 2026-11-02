/**
 * The strike list of a `/fo/dd_strikes` answer: finite positive numbers, unique and ascending. The backend spells the key
 * "stikes"; `strikes` and `strike` are accepted too. Anything else yields an empty list, never a guess.
 */
export function readStrikes(data: { stikes?: unknown; strikes?: unknown; strike?: unknown } | null | undefined): number[] {
  const raw = [data?.stikes, data?.strikes, data?.strike].find(Array.isArray) as unknown[] | undefined;
  const strikes = (raw ?? []).map(Number).filter(strike => Number.isFinite(strike) && strike > 0);
  return [...new Set(strikes)].sort((a, b) => a - b);
}

/**
 * The backend answers HTTP 422 with `errors.strike_price: ["No data available."]` when no strikes are listed for the expiry
 * (an unknown symbol, a date that is not an expiry, or one without data). That is an empty result, not a failure.
 */
export function isNoStrikesResponse(error: unknown): boolean {
  const { status, error: body } = (error ?? {}) as { status?: number; error?: { errors?: { strike_price?: unknown } } };
  const messages = body?.errors?.strike_price;
  return status === 422 && Array.isArray(messages) && messages.length === 1 && messages[0] === 'No data available.';
}
