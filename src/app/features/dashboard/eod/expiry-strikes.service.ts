import { Injectable } from '@angular/core';
import { Observable, catchError, finalize, map, of, shareReplay, tap } from 'rxjs';
import { isNoStrikesResponse, readStrikes } from '../../../shared/utils/expiry-strikes';
import { EodService } from './eod.service';

export type ExpiryStrikesResult =
  | { ok: true; strikes: number[] }
  /** `none`: the backend lists no strikes for this expiry; `unavailable`: the request failed. */
  | { ok: false; reason: 'none' | 'unavailable' };

/**
 * The strikes listed for one expiry (`/fo/dd_strikes`), shared by the F&O EOD and Multi-Leg EOD screens.
 * Successful answers are cached per symbol and expiry and in-flight requests are shared, so a strike list is never fetched twice.
 * Failures are not cached, so a retry asks again.
 */
@Injectable({ providedIn: 'root' })
export class ExpiryStrikesService {
  private readonly cache = new Map<string, ExpiryStrikesResult>();
  private readonly inflight = new Map<string, Observable<ExpiryStrikesResult>>();

  constructor(private readonly eod: EodService) {}

  resolve(symbol: string, expiry: string): Observable<ExpiryStrikesResult> {
    const key = `${symbol}|${expiry}`;
    const cached = this.cache.get(key);
    if (cached) return of(cached);
    const running = this.inflight.get(key);
    if (running) return running;
    const lookup$ = this.eod.getDdStrikes({ symbol, expiry }).pipe(
      map((response): ExpiryStrikesResult => {
        const strikes = readStrikes(response.data);
        return strikes.length ? { ok: true, strikes } : { ok: false, reason: 'none' };
      }),
      catchError((error): Observable<ExpiryStrikesResult> => of({ ok: false, reason: isNoStrikesResponse(error) ? 'none' : 'unavailable' })),
      tap(result => { if (result.ok) this.cache.set(key, result); }),
      finalize(() => this.inflight.delete(key)),
      shareReplay(1),
    );
    this.inflight.set(key, lookup$);
    return lookup$;
  }
}
