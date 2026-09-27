import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, catchError, shareReplay } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface TickerItem {
  symbol: string;
  price: string;
  change: string;
  positive: boolean;
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
}

export interface TickerApiResponse {
  success: boolean;
  data: TickerApiItem[];
}

@Injectable({ providedIn: 'root' })
export class TickerService {
  private readonly http = inject(HttpClient);

  /** One request shared by the ticker tape and the dashboard market summary. */
  private readonly ticker$ = this.http.post<TickerApiResponse>(`${environment.apiBaseUrl}/fo/ticker`, {}).pipe(
    map((response) => {
      if (response && response.success && Array.isArray(response.data)) {
        return response.data.map((item) => {
          const numericChange = Number(item.change);
          return {
            symbol: item.symbol,
            price: typeof item.price === 'number' ? item.price.toFixed(2) : String(item.price),
            change:
              (numericChange > 0 ? '+' : '') +
              (typeof item.change === 'number' ? item.change.toFixed(2) : String(item.change)),
            positive: numericChange > 0,
            priceValue: Number(item.price),
            changeValue: numericChange,
          };
        });
      }
      return [];
    }),
    catchError((error) => {
      console.error('Ticker API error:', error);
      return of([] as TickerItem[]);
    }),
    shareReplay({ bufferSize: 1, refCount: false }),
  );

  getTicker(): Observable<TickerItem[]> {
    return this.ticker$;
  }
}
