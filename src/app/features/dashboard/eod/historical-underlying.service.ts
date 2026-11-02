import { Injectable } from '@angular/core';
import { Observable, catchError, finalize, map, of, shareReplay, switchMap, tap } from 'rxjs';
import { isNoUnderlyingDataResponse, nearestStrike, sessionsOnOrBefore } from '../../../shared/utils/atm-strike';
import { EodChartRequest } from './eod.model';
import { EodService } from './eod.service';

/** The underlying on one past trading session, as `dd_symbol_details` reports it for that `trade_date`. */
export interface HistoricalUnderlying {
  /** The session the figures belong to: the requested date, or the previous session when it was not a trading day. */
  session: string;
  /** Underlying close of that session (`dd_symbol_details.underlying`). */
  underlying: number;
  /** Strikes listed on that session, ascending. */
  strikes: number[];
  /** The listed strike nearest to `underlying`. */
  atm: number;
}

/**
 * - `no-session`: no trading session on or before the date.
 * - `no-data`: every attempted session answered that the backend holds no underlying price for it (its price history does not reach that
 *   far back). A gap in the data, not a failure: nothing is retried and no error is raised.
 * - `unavailable`: a genuine failure (server error, network error, an unexpected answer).
 */
export type HistoricalUnderlyingResult =
  | ({ ok: true } & HistoricalUnderlying)
  | { ok: false; reason: 'no-session' | 'no-data' | 'unavailable' };

/** Shown, as information and without an error toast, when the underlying close is not available for the date. */
export const UNDERLYING_UNAVAILABLE_MESSAGE =
  'Historical underlying closing price is unavailable for this date. ATM cannot be calculated automatically. Please select a strike manually.';

type SessionOutcome = { kind: 'ok'; value: HistoricalUnderlying } | { kind: 'no-data' } | { kind: 'error' };

/** How far back the session lookup reaches: longer than any run of weekends and exchange holidays. */
const LOOKBACK_DAYS = 14;
/** Sessions tried (newest first) before giving up, in case the newest one has no option data. */
const MAX_SESSIONS_TRIED = 3;

const daysBefore = (iso: string, days: number): string => new Date(Date.parse(`${iso}T00:00:00Z`) - days * 86400000).toISOString().slice(0, 10);

/**
 * The underlying's closing price on a past date, for choosing a default ATM strike.
 *
 * Existing endpoints only: the sessions come from the symbol's EOD series (`/fo/eod/chart`, dates only), and the price and
 * strike list for that session from `/fo/dd_symbol_details` with `trade_date`. That endpoint answers HTTP 422 for a weekend or
 * holiday, so the date is first mapped to the latest trading session on or before it. Nothing falls back to the current price.
 * Successful answers are cached per symbol and date; failures are not, so a retry asks again.
 */
@Injectable({ providedIn: 'root' })
export class HistoricalUnderlyingService {
  private readonly cache = new Map<string, HistoricalUnderlyingResult>();
  private readonly inflight = new Map<string, Observable<HistoricalUnderlyingResult>>();

  constructor(private readonly eod: EodService) {}

  resolve(symbol: string, till: string): Observable<HistoricalUnderlyingResult> {
    const key = `${symbol}|${till}`;
    const cached = this.cache.get(key);
    if (cached) return of(cached);
    const running = this.inflight.get(key);
    if (running) return running;

    const request: EodChartRequest = { symbol, option_type: 'XX', date_from: daysBefore(till, LOOKBACK_DAYS), date_till: till };
    const lookup$ = this.eod.getEodChart(request).pipe(
      map(response => sessionsOnOrBefore((response.data ?? []).map(point => point.date), till).slice(0, MAX_SESSIONS_TRIED)),
      switchMap(sessions => (sessions.length ? this.firstSessionWithData(symbol, sessions) : of<HistoricalUnderlyingResult>({ ok: false, reason: 'no-session' }))),
      catchError(() => of<HistoricalUnderlyingResult>({ ok: false, reason: 'unavailable' })),
      tap(result => { if (result.ok) this.cache.set(key, result); }),
      finalize(() => this.inflight.delete(key)),
      shareReplay(1),
    );
    this.inflight.set(key, lookup$);
    return lookup$;
  }

  /**
   * Tries the sessions newest first and returns the first with a usable close. One session without data does not end the search (an older one
   * may have it). When none has, the result says why: `no-data` only if every attempt got the backend's specific "no data" answer, otherwise
   * `unavailable`, because a genuine failure on any attempt means the gap cannot be told apart from an outage.
   */
  private firstSessionWithData(symbol: string, sessions: string[], sawError = false): Observable<HistoricalUnderlyingResult> {
    const [session, ...older] = sessions;
    return this.eod.getDdGreeks({ symbol, trade_date: session }).pipe(
      map((response): SessionOutcome => {
        const data = response.data;
        const strikes = [...(data?.strike ?? [])].filter(Number.isFinite).sort((a, b) => a - b);
        const atm = nearestStrike(strikes, data?.underlying);
        // An answer without a usable price or strikes is unexpected, not a documented gap.
        return atm === null ? { kind: 'error' } : { kind: 'ok', value: { session, underlying: data.underlying, strikes, atm } };
      }),
      catchError((error): Observable<SessionOutcome> => of(isNoUnderlyingDataResponse(error) ? { kind: 'no-data' } : { kind: 'error' })),
      switchMap((outcome): Observable<HistoricalUnderlyingResult> => {
        if (outcome.kind === 'ok') return of({ ok: true, ...outcome.value });
        const failed = sawError || outcome.kind === 'error';
        if (older.length) return this.firstSessionWithData(symbol, older, failed);
        return of({ ok: false, reason: failed ? 'unavailable' : 'no-data' });
      }),
    );
  }
}
