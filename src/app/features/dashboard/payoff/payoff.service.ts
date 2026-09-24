import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { GreeksCalculatorService } from '../greeks/greeks-calculator.service';
import { PayoffChain, PayoffChainRow, PayoffRequest, PayoffResponse, PayoffSymbolDetails } from './payoff.model';

@Injectable({ providedIn: 'root' })
export class PayoffService {
    constructor(private readonly api: ApiService, private readonly greeks: GreeksCalculatorService) { }

    getSymbols(): Observable<string[]> {
        return this.greeks.getSymbols();
    }

    /** Underlying, expiries, lot size and HV-20 come from the shared symbol-details API. */
    getSymbolDetails(symbol: string): Observable<PayoffSymbolDetails> {
        return this.greeks.getSymbolDetails({ symbol });
    }

    /** Strike-wise CE/PE settlement prices for the selected symbol. */
    getPayoff(symbol: string): Observable<PayoffChain> {
        return this.api.post<PayoffResponse, PayoffRequest>('/tools/payoff', { symbol }).pipe(
            map(response => {
                const data = response.data;
                if (!response.success || !data || typeof data !== 'object') throw new Error('Invalid payoff response');
                const rows: PayoffChainRow[] = Object.entries(data.strikes ?? {})
                    .map(([strike, settlement]) => ({
                        strike: Number(strike),
                        ce: this.price(settlement?.CE),
                        pe: this.price(settlement?.PE),
                    }))
                    .filter(row => Number.isFinite(row.strike) && row.strike > 0 && (row.ce !== null || row.pe !== null))
                    .sort((a, b) => a.strike - b.strike);
                return { symbol: data.symbol || symbol, tradeDate: data.trade_date, rows };
            })
        );
    }

    private price(value: unknown): number | null {
        return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
    }
}
