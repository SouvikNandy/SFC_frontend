import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { GreeksCalculatorService } from '../greeks/greeks-calculator.service';
import { OptionsChainService } from '../options-chain/options-chain.service';
import { ExpiryQuotes, PayoffQuote, PayoffSymbolDetails } from './payoff.model';

@Injectable({ providedIn: 'root' })
export class PayoffService {
    constructor(private readonly greeks: GreeksCalculatorService, private readonly chains: OptionsChainService) { }

    getSymbols(): Observable<string[]> {
        return this.greeks.getSymbols();
    }

    /** Underlying, expiries, lot size and HV-20 come from the shared symbol-details API. */
    getSymbolDetails(symbol: string): Observable<PayoffSymbolDetails> {
        return this.greeks.getSymbolDetails({ symbol });
    }

    /**
     * EOD CE/PE prices for every strike of one expiry, via the existing option-chain API.
     * This is the real equivalent of the prototype's chainPremium(type, K, days): the price
     * depends on option type, strike and expiry.
     */
    getExpiryQuotes(symbol: string, expiry: string): Observable<ExpiryQuotes> {
        return this.chains.getOptionChain({ symbol, expiry }).pipe(
            map(view => {
                const quotes: PayoffQuote[] = view.rows
                    .map(row => ({ strike: row.strike, ce: this.price(row.call.ltp), pe: this.price(row.put.ltp) }))
                    .filter(quote => Number.isFinite(quote.strike) && quote.strike > 0 && (quote.ce !== null || quote.pe !== null))
                    .sort((a, b) => a.strike - b.strike);
                return {
                    status: 'ready' as const,
                    byStrike: new Map(quotes.map(quote => [quote.strike, quote])),
                    callStrikes: quotes.filter(quote => quote.ce !== null).map(quote => quote.strike),
                    putStrikes: quotes.filter(quote => quote.pe !== null).map(quote => quote.strike),
                };
            })
        );
    }

    /** A zero or missing price means the contract has no quote. */
    private price(value: unknown): number | null {
        return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
    }
}
