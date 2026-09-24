import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface TickerItem {
  symbol: string;
  price: string;
  change: string;
  positive: boolean;
}

export interface TickerApiResponse {
  success: boolean;
  data: any[];
}

@Injectable({ providedIn: 'root' })
export class TickerService {
  private readonly http = inject(HttpClient);

  getTicker(): Observable<TickerItem[]> {
    return this.http.post<TickerApiResponse>(`${environment.apiBaseUrl}/fo/ticker`, {}).pipe(
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
            };
          });
        }
        return [];
      }),
      catchError((error) => {
        console.error('Ticker API error:', error);
        return of([]);
      }),
    );
  }
}
