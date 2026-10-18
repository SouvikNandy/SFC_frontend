import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import {
    AddFillData,
    AddFillRequest,
    ApiEnvelope,
    BasketChartData,
    BasketChartRequest,
    BasketRemoveData,
    BasketRemoveRequest,
    BasketRenameData,
    BasketRenameRequest,
    BasketsData,
    BasketsRequest,
    ClosedListData,
    ClosedListRequest,
    OpenListData,
    OpenListRequest,
    PerformanceData,
    PerformanceRequest,
    SquareOffData,
    SquareOffRequest,
} from './models/portfolio.model';

/** A failed Portfolio API call in a form the UI can show. */
export class PortfolioApiError extends Error {
    constructor(
        message: string,
        readonly status: number,
        readonly code: string,
        /** Field problems keyed by field name (business-rule problems are keyed `detail`, or `name` for rename). */
        readonly fields: Readonly<Record<string, readonly string[]>> = {},
    ) {
        super(message);
    }

    get isNotFound(): boolean { return this.status === 404; }
    get isValidation(): boolean { return this.status === 422; }
    get isUnauthorized(): boolean { return this.status === 401; }
}

/** Turns an HTTP error (or an envelope with success=false) into one readable message plus field details. */
export function toPortfolioApiError(error: unknown): PortfolioApiError {
    if (error instanceof PortfolioApiError) return error;
    if (error instanceof HttpErrorResponse) {
        const body = (error.error ?? {}) as Partial<ApiEnvelope<unknown>>;
        const fields = body.errors && typeof body.errors === 'object' ? body.errors : {};
        const code = typeof body.message === 'string' ? body.message : '';
        const status = error.status;
        const first = Object.values(fields).flat().find(text => typeof text === 'string' && text);
        // For 401 the backend can put a raw server-side dump in `errors` (seen live with an invalid token), so the
        // message is always the friendly one; the original text stays available in `fields`.
        let message = status === 401 ? 'Your session has expired. Please sign in again.' : (first ?? '');
        if (!message) {
            if (status === 0) message = 'Unable to reach the server. Check your connection and try again.';
            else if (status === 404) message = code === 'BASKET_NOT_FOUND' ? 'Basket not found.' : 'Position not found.';
            else if (status === 422) message = 'Some of the values are not valid.';
            else message = 'Something went wrong. Please try again.';
        }
        return new PortfolioApiError(message, status, code, fields);
    }
    return new PortfolioApiError(error instanceof Error ? error.message : 'Something went wrong. Please try again.', 0, '');
}

/**
 * Paper-trading portfolio endpoints. Every call is a POST under `/portfolio/` on the configured API base URL;
 * authentication comes from the shared HTTP interceptor. The backend owns the ledger: the frontend only
 * sends fills and displays what is returned.
 */
@Injectable({ providedIn: 'root' })
export class PortfolioApiService {
    private readonly api = inject(ApiService);

    add(request: AddFillRequest): Observable<AddFillData> {
        return this.post<AddFillData, AddFillRequest>('/portfolio/add', request);
    }

    squareOff(request: SquareOffRequest): Observable<SquareOffData> {
        return this.post<SquareOffData, SquareOffRequest>('/portfolio/squareoff', request);
    }

    openList(request: OpenListRequest = {}): Observable<OpenListData> {
        return this.post<OpenListData, OpenListRequest>('/portfolio/open-list', request);
    }

    closedList(request: ClosedListRequest = {}): Observable<ClosedListData> {
        return this.post<ClosedListData, ClosedListRequest>('/portfolio/closed-list', request);
    }

    performance(request: PerformanceRequest = {}): Observable<PerformanceData> {
        return this.post<PerformanceData, PerformanceRequest>('/portfolio/performance', request);
    }

    baskets(request: BasketsRequest = {}): Observable<BasketsData> {
        return this.post<BasketsData, BasketsRequest>('/portfolio/baskets', request);
    }

    basketChart(request: BasketChartRequest): Observable<BasketChartData> {
        return this.post<BasketChartData, BasketChartRequest>('/portfolio/baskets-chart', request);
    }

    renameBasket(request: BasketRenameRequest): Observable<BasketRenameData> {
        return this.post<BasketRenameData, BasketRenameRequest>('/portfolio/baskets-rename', request);
    }

    removeBasket(request: BasketRemoveRequest): Observable<BasketRemoveData> {
        return this.post<BasketRemoveData, BasketRemoveRequest>('/portfolio/baskets-remove', request);
    }

    /** Unwraps `data` from the envelope; failures surface as PortfolioApiError. */
    private post<T, B>(path: string, body: B): Observable<T> {
        return this.api.post<ApiEnvelope<T>, B>(path, body).pipe(
            map(response => {
                if (!response?.success) {
                    const fields = response?.errors ?? {};
                    const first = Object.values(fields).flat().find(text => typeof text === 'string' && text);
                    throw new PortfolioApiError(first ?? response?.message ?? 'Request failed.', response?.error_code ?? 0, response?.message ?? '', fields);
                }
                return response.data;
            }),
            // Errors are mapped here so callers only ever deal with PortfolioApiError.
            catchError((error: unknown) => throwError(() => toPortfolioApiError(error))),
        );
    }
}
