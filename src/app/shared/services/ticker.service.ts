import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';

export interface TickerItem {
    symbol: string;
    price: string;
    change: string;
    positive: boolean;
}

@Injectable({ providedIn: 'root' })
export class TickerService {
    /**
     * Returns the approved demo ticker values. Kept isolated so it can be
     * replaced with a real API/WebSocket implementation later.
     */
    getDemoTicker(): Observable<TickerItem[]> {
        const items: TickerItem[] = [
            { symbol: 'NIFTY', price: '24812.35', change: '+64.20', positive: true },
            { symbol: 'BANKNIFTY', price: '55320.10', change: '-142.50', positive: false },
            { symbol: 'RELIANCE', price: '1486.20', change: '+3.80', positive: true },
            { symbol: 'HDFCBANK', price: '1672.55', change: '-17.45', positive: false },
            { symbol: 'NIFTY', price: '24812.35', change: '+64.20', positive: true },
            { symbol: 'BANKNIFTY', price: '55320.10', change: '-142.50', positive: false }
        ];

        return of(items);
    }
}
