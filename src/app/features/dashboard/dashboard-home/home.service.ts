import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { MarketCard, QuickLink } from './models/home.model';

/**
 * HomeService
 * NOTE: The approved prototype provides the visual data for the Home page.
 * At the time of implementation there are no confirmed REST endpoints for
 * market summary or quick-links in the project's API surface. This service
 * isolates the prototype/mock data so it can be replaced by real API calls
 * once the backend contract exposes the relevant endpoints.
 */
@Injectable({ providedIn: 'root' })
export class HomeService {
    getMarketSummary(): Observable<MarketCard[]> {
        const data: MarketCard[] = [
            { symbol: 'NIFTY 50', value: '24,812.35', change: '+0.26%', up: true },
            { symbol: 'BANKNIFTY', value: '55,320.10', change: '−0.26%', up: false },
            { symbol: 'SENSEX', value: '81,244.02', change: '+0.55%', up: true },
            { symbol: 'INDIA VIX', value: '11.82', change: '+2.10%', up: true }
        ];

        return of(data);
    }

    getQuickLinks(): Observable<QuickLink[]> {
        const links: QuickLink[] = [
            { key: 'portfolio', title: 'Portfolio', desc: 'Live P&L across your open positions' },
            { key: 'chain', title: 'Options Chain', desc: 'Full NIFTY / BANKNIFTY chain with OI & IV' },
            { key: 'greeks', title: 'Greeks Calculator', desc: 'Delta, Gamma, Theta & Vega for any contract' },
            { key: 'payoff', title: 'Payoff Simulator', desc: 'Visualise P&L at expiry for any strategy' },
            { key: 'eod', title: 'F&O EOD Data', desc: '5-year searchable historical database' },
            { key: 'alerts', title: 'Price Alerts', desc: 'Get notified when a target price is hit' }
        ];

        return of(links);
    }
}
