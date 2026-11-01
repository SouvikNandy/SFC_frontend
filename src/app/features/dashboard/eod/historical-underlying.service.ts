import { Injectable } from '@angular/core';
import { Observable, catchError, finalize, map, of, shareReplay, switchMap, tap } from 'rxjs';
import { nearestStrike, sessionsOnOrBefore } from '../../../shared/utils/atm-strike';
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

export type HistoricalUnderlyingResult =
  | ({ ok: true } & HistoricalUnderlying)
  | { ok: false; reason: 'no-session' | 'unavailable' };

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

  private firstSessionWithData(symbol: string, sessions: string[]): Observable<HistoricalUnderlyingResult> {
    const [session, ...older] = sessions;
    return this.eod.getDdGreeks({ symbol, trade_date: session }).pipe(
      map((response): HistoricalUnderlyingResult | null => {
        const data = response.data;
        const strikes = [...(data?.strike ?? [])].filter(Number.isFinite).sort((a, b) => a - b);
        const atm = nearestStrike(strikes, data?.underlying);
        return atm === null ? null : { ok: true, session, underlying: data.underlying, strikes, atm };
      }),
      catchError(() => of(null)),
      switchMap(result => (result ? of(result) : older.length ? this.firstSessionWithData(symbol, older) : of<HistoricalUnderlyingResult>({ ok: false, reason: 'unavailable' }))),
    );
  }
}
