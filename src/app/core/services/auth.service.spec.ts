import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { environment } from '../../../environments/environment';
import { AuthUser } from '../models/auth.model';
import { AuthService } from './auth.service';
import { StorageService } from './storage.service';

const USER: AuthUser = {
  id: '1', first_name: 'Test', last_name: 'User', email: 'secret.user@example.com', email_verified: true,
  phone: '9999999999', phone_verified: true, is_active: true, is_deleted: false, created_on: '2026-01-01',
};
const ACCESS = 'access-token-SECRET';
const REFRESH = 'refresh-token-SECRET';

describe('AuthService session handling', () => {
  let service: AuthService;
  let http: HttpTestingController;
  let storage: StorageService;

  beforeEach(() => {
    window.localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
    storage = TestBed.inject(StorageService);
  });

  afterEach(() => {
    http.verify();
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('persists the session and signs the user in after a successful login', () => {
    service.login({ email: USER.email, password: 'pw', method: 'direct' }).subscribe();
    http.expectOne(`${environment.apiBaseUrl}/auth/login`).flush({
      success: true, data: { access_token: ACCESS, refresh_token: REFRESH, user: USER },
    });

    expect(storage.getAccessToken()).toBe(ACCESS);
    expect(storage.getRefreshToken()).toBe(REFRESH);
    expect(service.isAuthenticated()).toBe(true);
    expect(service.currentUser()?.email).toBe(USER.email);
  });

  it('does not sign in when the login response is unsuccessful', () => {
    service.login({ email: USER.email, password: 'bad', method: 'direct' }).subscribe();
    http.expectOne(`${environment.apiBaseUrl}/auth/login`).flush({ success: false, message: 'Invalid' });

    expect(service.isAuthenticated()).toBe(false);
    expect(storage.getAccessToken()).toBeNull();
  });

  it('never writes tokens, responses or the user email to the console', () => {
    const spies = [
      vi.spyOn(console, 'log').mockImplementation(() => undefined),
      vi.spyOn(console, 'warn').mockImplementation(() => undefined),
      vi.spyOn(console, 'info').mockImplementation(() => undefined),
    ];
    service.login({ email: USER.email, password: 'pw', method: 'direct' }).subscribe();
    http.expectOne(`${environment.apiBaseUrl}/auth/login`).flush({
      success: true, data: { access_token: ACCESS, refresh_token: REFRESH, user: USER },
    });

    const logged = JSON.stringify(spies.flatMap((spy) => spy.mock.calls));
    expect(logged).not.toContain('SECRET');
    expect(logged).not.toContain(USER.email);
  });

  it('shares one refresh request between concurrent callers and stores the new tokens', () => {
    storage.setSession({ accessToken: 'old', refreshToken: 'old-refresh' }, USER);
    service.initialize();

    service.refreshToken().subscribe();
    service.refreshToken().subscribe();
    http.expectOne(`${environment.apiBaseUrl}/auth/refresh`).flush({
      success: true, data: { access_token: ACCESS, refresh_token: REFRESH, user: USER },
    });

    expect(storage.getAccessToken()).toBe(ACCESS);
    expect(storage.getRefreshToken()).toBe(REFRESH);
  });
});
