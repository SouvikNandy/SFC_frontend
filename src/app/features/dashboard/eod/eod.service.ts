import { Injectable } from '@angular/core';
import { ApiService } from '../../../core/services/api.service';
import { GreeksCalculatorService } from '../greeks/greeks-calculator.service';
import { DdGreeksRequest, DdGreeksResponse, EodChartRequest, EodChartResponse, EodDataRow, EodRequest, EodResponse } from './eod.model';
import { readEodPage } from './eod-rows.util';
import { Observable, map, of, switchMap } from 'rxjs';

/** Safety bound for paging through one contract's history. */
const MAX_EOD_PAGES = 40;

/**
 * Rows per request when loading a whole history. The backend caps every response at 500 rows: verified live on
 * 2026-10-18 with a 1,273-row series, where page_size 501, 1000 and 5000 all returned 500 rows with has_next=true
 * (it is not an error). Callers must therefore follow `has_next`, never infer the end from the row count.
 * Walking 500-row pages and 100-row pages produced identical, duplicate-free sets. page_size 0 returns HTTP 500.
 */
const ALL_ROWS_PAGE_SIZE = 500;

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

    /** The whole selected range for the F&O EOD chart (/fo/eod/chart); the paginated table keeps using getEod. */
    getEodChart(request: EodChartRequest): Observable<EodChartResponse> {
        return this.api.post<EodChartResponse, EodChartRequest>('/fo/eod/chart', request);
    }

    /**
     * Every row for a request, following the API's own pagination (`has_next`) page by page.
     * Rows are returned oldest first; fields the backend did not send are NaN, never fabricated.
     */
    getAllRows(request: Omit<EodRequest, 'page' | 'page_size'>, pageSize = ALL_ROWS_PAGE_SIZE): Observable<EodDataRow[]> {
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
