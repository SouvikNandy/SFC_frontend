import { Injectable, inject } from '@angular/core';
import { Observable, map, of } from 'rxjs';
import { TickerItem, TickerService } from '../../../shared/services/ticker.service';
import { MarketCard, QuickLink } from './models/home.model';

/** The design shows four market summary cards. */
const SUMMARY_CARD_COUNT = 4;

@Injectable({ providedIn: 'root' })
export class HomeService {
    private readonly ticker = inject(TickerService);

    /** Market summary cards from the ticker API (`POST /fo/ticker`), first four instruments in API order. */
    getMarketSummary(): Observable<MarketCard[]> {
        return this.ticker.getTicker().pipe(
            map(items => items.slice(0, SUMMARY_CARD_COUNT).map(item => this.toCard(item)))
        );
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

    /** Change shown as points and percent; percent uses the previous close implied by the API (price − change). */
    private toCard(item: TickerItem): MarketCard {
        const { priceValue: price, changeValue: change } = item;
        const previous = price - change;
        const sign = change > 0 ? '+' : change < 0 ? '-' : '';
        const points = Math.abs(change).toFixed(2);
        const percent = previous > 0 ? ` (${sign}${(Math.abs(change) / previous * 100).toFixed(2)}%)` : '';
        return {
            symbol: item.symbol,
            value: Number.isFinite(price) ? price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : item.price,
            change: Number.isFinite(change) ? `${sign}${points}${percent}` : item.change,
            up: change >= 0,
        };
    }
}
