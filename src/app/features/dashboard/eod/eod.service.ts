import { Injectable } from '@angular/core';
import { ApiService } from '../../../core/services/api.service';
import { GreeksCalculatorService } from '../greeks/greeks-calculator.service';
import { DdGreeksRequest, DdGreeksResponse, EodDataRow, EodRequest, EodResponse } from './eod.model';
import { readEodPage } from './eod-rows.util';
import { Observable, map, of, switchMap } from 'rxjs';

/** Safety bound for paging through one contract's history. */
const MAX_EOD_PAGES = 40;

@Injectable({ providedIn: 'root' })
export class EodService {
    constructor(private readonly api: ApiService, private readonly greeks: GreeksCalculatorService) { }

    /** All F&O symbols (`/fo/dd_list`), shared with the other calculator screens. */
    getSymbols(): Observable<string[]> {
        return this.greeks.getSymbols();
    }

    getEod(request: EodRequest): Observable<EodResponse> {
        return this.api.post<EodResponse, EodRequest>('/fo/eod', request);
    }

    /**
     * Every row for a request, following the API's own pagination (`has_next`) page by page.
     * Rows are returned oldest first; fields the backend did not send are NaN, never fabricated.
     */
    getAllRows(request: Omit<EodRequest, 'page' | 'page_size'>, pageSize = 50): Observable<EodDataRow[]> {
        const fetchPage = (page: number, acc: EodDataRow[]): Observable<EodDataRow[]> =>
            this.getEod({ ...request, page, page_size: pageSize }).pipe(
                switchMap(response => {
                    const data = readEodPage(response.data);
                    const rows = acc.concat(data.results);
                    return data.has_next && page < MAX_EOD_PAGES ? fetchPage(page + 1, rows) : of(rows);
                }),
            );
        return fetchPage(1, []).pipe(map(rows => rows.sort((a, b) => a.date.localeCompare(b.date))));
    }

    getDdGreeks(request: DdGreeksRequest): Observable<DdGreeksResponse> {
        return this.api.post<DdGreeksResponse, DdGreeksRequest>('/fo/dd_symbol_details', request);
    }
}
