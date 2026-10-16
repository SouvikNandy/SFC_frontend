import { Injectable, inject } from '@angular/core';
import { Observable, catchError, forkJoin, map, of } from 'rxjs';
import { GreeksCalculatorService } from '../greeks/greeks-calculator.service';
import { GreeksSymbolDetails } from '../greeks/greeks.model';
import { EodService } from '../eod/eod.service';
import { EodRequest } from '../eod/eod.model';
import { ContractRef, PriceHistory } from './models/portfolio.model';
import { ymd } from './portfolio-ledger';

/** `/fo/dd_symbol_details` also returns the lot size, which the shared Greeks model does not declare. */
export interface PortfolioSymbolDetails extends GreeksSymbolDetails {
    lot?: number | null;
}

export interface ContractCatalog {
    symbol: string;
    strikes: number[];
    atmStrike: number | null;
    /** Date of the latest EOD session the feed reports (YYYY-MM-DD), when provided. */
    tradeDate: string | null;
    /** Listed expiries, sorted, YYYY-MM-DD. */
    expiries: string[];
    lot: number | null;
}

export interface LatestClose {
    date: string;
    close: number;
}

/** Look-back used to find a contract's most recent EOD bar. */
const LATEST_LOOKBACK_DAYS = 14;

/**
 * Market data for the Portfolio screen, all from the existing endpoints:
 * `/fo/dd_list` (underlyings), `/fo/dd_symbol_details` (strikes, expiries, lot) and `/fo/eod` (closes).
 * There is no live feed: prices are EOD closes only.
 */
@Injectable({ providedIn: 'root' })
export class PortfolioMarketService {
    private readonly eod = inject(EodService);
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
                    tradeDate: typeof d.trade_date === 'string' && /^d{4}-d{2}-d{2}/.test(d.trade_date) ? d.trade_date.slice(0, 10) : null,
                    expiries,
                    lot: typeof d.lot === 'number' && Number.isInteger(d.lot) && d.lot > 0 ? d.lot : null,
                };
            }),
        );
    }

    /** Most recent EOD bar of a contract, or null when the API has none (the position then shows "no feed"). */
    getLatestClose(contract: ContractRef, today: Date = new Date()): Observable<LatestClose | null> {
        const till = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
        const from = new Date(till.getTime() - LATEST_LOOKBACK_DAYS * 86400000);
        return this.eod.getAllRows(this.request(contract, ymd(from), ymd(till))).pipe(
            map(rows => {
                const last = [...rows].reverse().find(row => Number.isFinite(row.close) && row.close > 0);
                return last ? { date: last.date, close: last.close } : null;
            }),
            catchError(() => of(null)),
        );
    }

    /** EOD closes for several contracts over a date range; a contract whose request fails has no entry. */
    getCloseHistory(contracts: readonly ContractRef[], from: string, to: string): Observable<PriceHistory> {
        if (!contracts.length) return of(new Map());
        return forkJoin(contracts.map(contract => this.eod.getAllRows(this.request(contract, from, to)).pipe(
            map(rows => [contract.key, new Map(rows.filter(r => Number.isFinite(r.close) && r.close > 0).map(r => [r.date, r.close] as const))] as const),
            catchError(() => of([contract.key, new Map<string, number>()] as const)),
        ))).pipe(map(entries => new Map(entries) as PriceHistory));
    }

    /** Futures follow the existing F&O EOD contract (option_type XX, no strike/expiry); options send strike and expiry. */
    private request(contract: ContractRef, from: string, to: string): Omit<EodRequest, 'page' | 'page_size'> {
        const base = { symbol: contract.underlying, date_from: from, date_till: to };
        return contract.kind === 'future'
            ? { ...base, option_type: 'XX' }
            : { ...base, option_type: contract.optionType ?? 'CE', strike: contract.strike ?? undefined, expiry: contract.expiry };
    }
}
