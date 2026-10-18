import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { authInterceptor } from '../../../core/interceptors/auth.interceptor';
import { StorageService } from '../../../core/services/storage.service';
import { PortfolioApiError, PortfolioApiService } from './portfolio-api.service';

const BASE = `${environment.apiBaseUrl}/portfolio`;
const envelope = <T>(data: T, message = 'OK') => ({ success: true, message, data, timestamp: '2026-10-17T00:00:00Z', path: '/x' });

describe('PortfolioApiService', () => {
  let api: PortfolioApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting(), provideRouter([])],
    });
    api = TestBed.inject(PortfolioApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const call = (path: string, run: () => Observable<unknown>, data: unknown) => {
    let result: unknown;
    run().subscribe(value => (result = value));
    const req = http.expectOne(`${BASE}/${path}`);
    req.flush(envelope(data));
    return { req, result: () => result };
  };

  it('uses POST with a JSON body for every documented endpoint, on the configured base URL (no duplicated /api/v1)', () => {
    const checks: Array<[string, () => Observable<unknown>, unknown]> = [
      ['add', () => api.add({ segment: 'FUT', symbol: 'NIFTY', expiry_date: '2026-11-26', side: 'Buy', qnt: 1, open_price: '100.00', date: '2026-10-12', lot_size: 75 }), { action: 'opened' }],
      ['squareoff', () => api.squareOff({ id: 'p1', closing_price: '150.00' }), { realised: '0.00' }],
      ['open-list', () => api.openList({ segment: 'OPT', sort_by: 'cmp', sort_dir: 'asc' }), { results: [] }],
      ['closed-list', () => api.closedList({ group: 'week' }), { results: [] }],
      ['performance', () => api.performance({ group: 'day', date_from: '2026-10-01' }), { metrics: {} }],
      ['baskets', () => api.baskets({ closed_limit: 5 }), { baskets: [] }],
      ['baskets-chart', () => api.basketChart({ id: 'b1', days: 10 }), { rows: [] }],
      ['baskets-rename', () => api.renameBasket({ id: 'b1', name: 'New' }), { id: 'b1', name: 'New' }],
      ['baskets-remove', () => api.removeBasket({ id: 'b1' }), { id: 'b1', name: 'X', unassigned: 2 }],
    ];
    for (const [path, run, data] of checks) {
      const { req, result } = call(path, run, data);
      expect(req.request.method).toBe('POST');
      expect(req.request.url).toBe(`https://quantsfc.com/api/v1/portfolio/${path}`);
      expect(req.request.url.match(/\/api\/v1/g)).toHaveLength(1);
      expect(result()).toEqual(data);                   // `data` is unwrapped from the envelope
    }
  });

  it('sends the exact field names and values given (no renaming)', () => {
    const body = { segment: 'OPT', symbol: 'NIFTY', type: 'CE', strike: '24500.00', expiry_date: '2026-11-26', side: 'Sell', qnt: 3,
      open_price: '120.50', date: '2026-10-12', lot_size: 75, basket_name: 'Weekly' } as const;
    const { req } = call('add', () => api.add(body), { action: 'opened' });
    expect(req.request.body).toEqual(body);
    expect(req.request.body).not.toHaveProperty('basket_id');
  });

  it('sends {} when nothing is selected', () => {
    for (const [path, run] of [
      ['open-list', () => api.openList()], ['closed-list', () => api.closedList()], ['performance', () => api.performance()], ['baskets', () => api.baskets()],
    ] as Array<[string, () => Observable<unknown>]>) {
      const { req } = call(path, run, {});
      expect(req.request.body).toEqual({});
    }
  });

  it('applies the bearer token through the existing interceptor', () => {
    TestBed.inject(StorageService).setAccessToken('token-123');
    const { req } = call('open-list', () => api.openList(), { results: [] });
    expect(req.request.headers.get('Authorization')).toBe('Bearer token-123');
  });

  it('does not treat an empty successful response as a failure', () => {
    const { result } = call('open-list', () => api.openList(), { summary: null, segment_counts: { all: 0, FUT: 0, OPT: 0 }, expiring_soon: 0, results: [] });
    expect((result() as { results: unknown[] }).results).toEqual([]);
  });

  describe('errors', () => {
    const fail = (path: string, run: () => Observable<unknown>, status: number, body: unknown): PortfolioApiError => {
      let error: unknown;
      run().subscribe({ error: (e: unknown) => (error = e) });
      http.expectOne(`${BASE}/${path}`).flush(body as object, { status, statusText: 'x' });
      return error as PortfolioApiError;
    };

    it('422: field problems are keyed by field and the first is the message', () => {
      const error = fail('add', () => api.add({ segment: 'OPT', symbol: 'N', expiry_date: '2026-01-01', side: 'Buy', qnt: 1, open_price: '1.00', date: '2026-01-02', lot_size: 1 }), 422,
        { success: false, message: 'VALIDATION_FAILED', data: '', errors: { type: ['type is required for OPT.'], strike: ['strike is required for OPT.'] }, error_code: 422 });
      expect(error).toBeInstanceOf(PortfolioApiError);
      expect(error.isValidation).toBe(true);
      expect(error.message).toBe('type is required for OPT.');
      expect(error.fields['strike']).toEqual(['strike is required for OPT.']);
    });

    it('422: business-rule problems arrive under `detail`', () => {
      const error = fail('squareoff', () => api.squareOff({ id: 'p', closing_price: '1.00', qnt: 3 }), 422,
        { success: false, message: 'VALIDATION_FAILED', errors: { detail: ['Cannot square off 3 lots; only 2 open.'] } });
      expect(error.message).toBe('Cannot square off 3 lots; only 2 open.');
    });

    it('404 for a position and for a basket', () => {
      const position = fail('squareoff', () => api.squareOff({ id: 'p', closing_price: '1.00' }), 404, { success: false, message: 'POSITION_NOT_FOUND', errors: { id: ['Open position not found.'] } });
      expect(position.isNotFound).toBe(true);
      expect(position.message).toBe('Open position not found.');
      const basket = fail('baskets-chart', () => api.basketChart({ id: 'b' }), 404, { success: false, message: 'BASKET_NOT_FOUND' });
      expect(basket.message).toBe('Basket not found.');
    });

    it('401 and network failures give readable messages', () => {
      const unauthorized = fail('open-list', () => api.openList(), 401, { success: false, message: 'UNAUTHORIZED', errors: { authorization: ['Authentication credentials were not provided.'] } });
      expect(unauthorized.isUnauthorized).toBe(true);
      let network: PortfolioApiError | undefined;
      api.openList().subscribe({ error: (e: PortfolioApiError) => (network = e) });
      http.expectOne(`${BASE}/open-list`).error(new ProgressEvent('error'));
      expect(network?.message).toMatch(/Unable to reach the server/);
    });

    it('401 with an invalid token: the raw server dump in errors is never shown (seen live), the message is friendly', () => {
      const dump = "{'detail': ErrorDetail(string='Given token not valid for any token type', code='token_not_valid')}";
      const error = fail('open-list', () => api.openList(), 401, { success: false, message: 'UNAUTHORIZED', errors: { authorization: [dump] }, error_code: 401 });
      expect(error.message).toBe('Your session has expired. Please sign in again.');
      expect(error.message).not.toContain('ErrorDetail');
      expect(error.isUnauthorized).toBe(true);
    });

    it('a 200 envelope with success=false is an error, not a success', () => {
      let error: PortfolioApiError | undefined;
      api.baskets().subscribe({ error: (e: PortfolioApiError) => (error = e) });
      http.expectOne(`${BASE}/baskets`).flush({ success: false, message: 'NOPE', data: '', errors: { closed_limit: ['bad'] } });
      expect(error?.message).toBe('bad');
    });
  });
});
