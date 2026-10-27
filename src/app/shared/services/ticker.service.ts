import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { map, catchError, shareReplay } from 'rxjs/operators';
import { ApiService } from '../../core/services/api.service';

/** Direction of a move. Always derived from the numeric change; the API's own `positive` flag is ignored. */
export type ChangeDirection = 'up' | 'down' | 'flat';

export function changeDirection(change: number): ChangeDirection {
  return Number.isFinite(change) ? (change > 0 ? 'up' : change < 0 ? 'down' : 'flat') : 'flat';
}

export interface TickerItem {
  symbol: string;
  price: string;
  change: string;
  positive: boolean;
  direction: ChangeDirection;
  /** Session the price and change belong to (`latest_date`, YYYY-MM-DD), when the API sends it. */
  latestDate?: string;
  /** Raw values from the API, for consumers that format or derive their own figures. */
  priceValue: number;
  changeValue: number;
}

/** One entry of `POST /fo/ticker` → `data[]` (verified against the live API). */
export interface TickerApiItem {
  symbol: string;
  price: number;
  change: number;
  positive: boolean;
  latest_date?: string;
}

export interface TickerApiResponse {
  success: boolean;
  data: TickerApiItem[];
}

@Injectable({ providedIn: 'root' })
export class TickerService {
  private readonly api = inject(ApiService);
  private ticker$: Observable<TickerItem[]> | null = null;

  /**
   * One request shared by the ticker tape and the dashboard market summary. A successful result is reused;
   * a failed or unsuccessful one emits an empty list but is not kept, so the next caller requests again.
   */
  getTicker(): Observable<TickerItem[]> {
    if (!this.ticker$) {
      const shared$ = this.api.post<TickerApiResponse, Record<string, never>>('/fo/ticker', {}).pipe(
        map((response) => this.toItems(response)),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
      const current$: Observable<TickerItem[]> = shared$.pipe(
        catchError(() => {
          if (this.ticker$ === current$) this.ticker$ = null;
          return of([] as TickerItem[]);
        }),
      );
      this.ticker$ = current$;
    }
    return this.ticker$;
  }

  private toItems(response: TickerApiResponse): TickerItem[] {
    if (!response || !response.success || !Array.isArray(response.data)) throw new Error('Invalid ticker response');
    return response.data.map((item) => {
      const numericChange = Number(item.change);
      return {
        symbol: item.symbol,
        price: typeof item.price === 'number' ? item.price.toFixed(2) : String(item.price),
        change:
          (numericChange > 0 ? '+' : '') +
          (typeof item.change === 'number' ? item.change.toFixed(2) : String(item.change)),
        positive: numericChange > 0,
        direction: changeDirection(numericChange),
        ...(typeof item.latest_date === 'string' && item.latest_date ? { latestDate: item.latest_date } : {}),
        priceValue: Number(item.price),
        changeValue: numericChange,
      };
    });
  }
}
