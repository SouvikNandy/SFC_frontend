import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { GreeksCalculatorService } from '../greeks/greeks-calculator.service';
import { GreeksSymbolDetails } from '../greeks/greeks.model';

/** `/fo/dd_symbol_details` also returns the lot size, which the shared Greeks model does not declare. */
export interface PortfolioSymbolDetails extends GreeksSymbolDetails {
    lot?: number | null;
}

/** What the paper-fill form needs to build a contract for one underlying. */
export interface ContractCatalog {
    symbol: string;
    strikes: number[];
    atmStrike: number | null;
    /** Latest EOD session date reported by the feed (YYYY-MM-DD), when provided. */
    tradeDate: string | null;
    /** Listed expiries, sorted, YYYY-MM-DD. */
    expiries: string[];
    lot: number | null;
}

/**
 * Contract choices for the paper-fill form, from the existing `/fo/dd_list` (underlyings) and
 * `/fo/dd_symbol_details` (strikes, expiries, lot size). Prices and P&L come only from the Portfolio API.
 */
@Injectable({ providedIn: 'root' })
export class PortfolioMarketService {
    private readonly greeks = inject(GreeksCalculatorService);

    getUnderlyings(): Observable<string[]> {
        return this.greeks.getSymbols();
    }

    getCatalog(symbol: string): Observable<ContractCatalog> {
        return this.greeks.getSymbolDetails({ symbol }).pipe(
            map(details => {
                const d = details as PortfolioSymbolDetails;
                const raw = Array.isArray(d.expiry_date) ? d.expiry_date : [d.expiry_date];
                const expiries = [...new Set(raw.map(value => String(value).slice(0, 10)).filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value)))].sort();
                return {
                    symbol,
                    strikes: [...(d.strike ?? [])].filter(strike => Number.isFinite(strike)).sort((a, b) => a - b),
                    atmStrike: Number.isFinite(d.atm_strike) ? d.atm_strike : null,
                    tradeDate: typeof d.trade_date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d.trade_date) ? d.trade_date.slice(0, 10) : null,
                    expiries,
                    lot: typeof d.lot === 'number' && Number.isInteger(d.lot) && d.lot > 0 ? d.lot : null,
                };
            }),
        );
    }
}
