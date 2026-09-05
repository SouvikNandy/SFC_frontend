import { Injectable, signal } from '@angular/core';
import { Observable, of, catchError, finalize, shareReplay, tap, throwError } from 'rxjs';

import {
  AuthUser, AuthTokenData, DEFAULT_OTP, RegistrationContext,
  ForgotPasswordRequest,
  LoginRequest,
  LoginResponse,
  RefreshTokenRequest,
  RefreshTokenResponse,
  RegisterRequest,
  RegisterResponse,
  ResetPasswordRequest,
  VerifyOtpRequest,
  VerifyOtpResponse
} from '../models/auth.model';
import { ApiService } from './api.service';
import { StorageService } from './storage.service';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  readonly isAuthenticated = signal(false);
  readonly currentUser = signal<AuthUser | null>(null);

  constructor(
    private readonly storageService: StorageService,
    private readonly apiService: ApiService
  ) {
    this.initialize();
  }

  private refreshInFlight$: Observable<RefreshTokenResponse> | null = null;

  initialize(): void {
    const token = this.storageService.getAccessToken();
    const user = this.storageService.getUser();

    this.isAuthenticated.set(Boolean(token));
    this.currentUser.set(user);
  }

  private persistSessionFromResponse(response: LoginResponse | VerifyOtpResponse | RefreshTokenResponse): void {
    const payload = response.data as any;

    if (!payload) {
      console.warn('[Auth] Payload is empty or null');
      return;
    }

    console.log('[Auth] Processing response payload:', payload);

    // Handle new format (direct access_token/refresh_token in payload)
    const hasDirectTokens = payload.access_token && payload.refresh_token;
    // Handle old format (tokens object)
    const hasTokensObject = payload.tokens && payload.tokens.accessToken && payload.tokens.refreshToken;

    if (!hasDirectTokens && !hasTokensObject) {
      console.warn('[Auth] No valid tokens found in response');
      return;
    }

    const tokensToNormalize = hasDirectTokens
      ? { accessToken: payload.access_token, refreshToken: payload.refresh_token }
      : payload.tokens;

    console.log('[Auth] Tokens to normalize:', tokensToNormalize);

    const tokens = this.normalizeTokens(tokensToNormalize);
    if (!tokens) {
      console.warn('[Auth] Failed to normalize tokens');
      return;
    }

    const user = payload.user;
    if (!user) {
      console.warn('[Auth] No user data in response');
      return;
    }

    console.log('[Auth] Persisting session with user:', user.email);
    this.storageService.setSession(tokens, user);
    this.currentUser.set(user);
    this.isAuthenticated.set(true);
    console.log('[Auth] Session persisted successfully');
  }

  private clearSession(): void {
    this.storageService.clearSession();
    this.currentUser.set(null);
    this.isAuthenticated.set(false);
  }

  login(request: LoginRequest): Observable<LoginResponse> {
    console.log('[Auth] Starting login with email:', request.email);
    return this.apiService.post<LoginResponse, LoginRequest>('/auth/login', request).pipe(
      tap((response) => {
        console.log('[Auth] Login response received:', response);
        if (response.success) {
          this.persistSessionFromResponse(response);
        } else {
          console.warn('[Auth] Login response not successful:', response.message);
        }
      })
    );
  }

  register(request: RegisterRequest): Observable<RegisterResponse> {
    return this.apiService.post<RegisterResponse, RegisterRequest>('/auth/register', request).pipe(
      tap((response) => {
        if (!response.success) return;
        const data = response.data as any;
        const registrationId = data?.registration_id;
        this.storageService.setRegistrationContext({ email: request.email, phone: request.phone, ...(registrationId ? { registrationId } : {}) });

        if (data?.user) {
          // Handle new format (direct access_token/refresh_token)
          const hasDirectTokens = data.access_token && data.refresh_token;

          if (hasDirectTokens) {
            const tokensToNormalize = { accessToken: data.access_token, refreshToken: data.refresh_token };
            const tokens = this.normalizeTokens(tokensToNormalize);
            if (tokens) {
              this.storageService.setSession(tokens, data.user);
              this.currentUser.set(data.user);
              this.isAuthenticated.set(true);
            }
          }
        }
      })
    );
  }

  verifyOtp(request: VerifyOtpRequest): Observable<VerifyOtpResponse> {
    if (request.otp !== DEFAULT_OTP) return throwError(() => new Error('Invalid OTP'));
    return of({ success: true, message: 'OTP verified locally', data: null } as VerifyOtpResponse).pipe(
      tap(() => this.storageService.clearRegistrationContext())
    );
  }

  forgotPassword(email: string): Observable<{ success: boolean }> {
    if (!email || email.trim().length === 0) {
      return of({ success: false });
    }

    const request: ForgotPasswordRequest = { email: email.trim() };

    return this.apiService.post<{ success: boolean }, ForgotPasswordRequest>('/auth/forgot-password', request);
  }

  resetPassword(request: ResetPasswordRequest): Observable<{ success: boolean }> {
    return this.apiService.post<{ success: boolean }, ResetPasswordRequest>('/auth/reset-password', request);
  }

  logout(): Observable<{ success: boolean }> {
    const refreshToken = this.storageService.getRefreshToken();

    this.storageService.clearRegistrationContext();
    if (!refreshToken) { this.clearSession(); return of({ success: true }); }
    return this.apiService.post<{ success: boolean }, RefreshTokenRequest>('/auth/logout', { refresh_token: refreshToken }).pipe(
      catchError(() => of({ success: false })),
      finalize(() => this.clearSession())
    );
  }

  refreshToken(): Observable<RefreshTokenResponse> {
    const refreshToken = this.storageService.getRefreshToken();

    if (!refreshToken) return throwError(() => new Error('Refresh token is not available.'));
    if (this.refreshInFlight$) return this.refreshInFlight$;
    this.refreshInFlight$ = this.apiService.post<RefreshTokenResponse, RefreshTokenRequest>('/auth/refresh', { refresh_token: refreshToken }).pipe(
      tap((response) => {
        const payload = response.data;
        if (!payload) throw new Error('Invalid refresh response');

        // Handle new format (direct access_token/refresh_token)
        const hasDirectTokens = 'access_token' in payload && payload.access_token && 'refresh_token' in payload && payload.refresh_token;
        // Handle old format (tokens object)
        const hasTokensObject = 'tokens' in payload && payload.tokens;

        if (!hasDirectTokens && !hasTokensObject) throw new Error('Invalid refresh response: no tokens found');

        const tokensToNormalize = hasDirectTokens
          ? { accessToken: payload.access_token, refreshToken: payload.refresh_token }
          : (payload as any).tokens;

        const tokens = this.normalizeTokens(tokensToNormalize);
        if (!tokens) throw new Error('Invalid refresh tokens');

        const user = (payload as any).user ?? this.storageService.getUser();
        if (!user) throw new Error('Invalid refresh response: no user found');

        this.storageService.setSession(tokens, user);
        this.currentUser.set(user);
        this.isAuthenticated.set(true);
      }),
      finalize(() => { this.refreshInFlight$ = null; }),
      shareReplay({ bufferSize: 1, refCount: false })
    );
    return this.refreshInFlight$;
  }

  getRegistrationContext(): RegistrationContext | null { return this.storageService.getRegistrationContext(); }
  clearRegistrationContext(): void { this.storageService.clearRegistrationContext(); }
  expireSession(): void { this.clearSession(); this.storageService.clearRegistrationContext(); }

  private normalizeTokens(tokens: AuthTokenData): AuthTokenData | null {
    const raw = tokens as AuthTokenData & { access_token?: string; refresh_token?: string };
    const accessToken = raw.accessToken ?? raw.access_token;
    const refreshToken = raw.refreshToken ?? raw.refresh_token;
    return accessToken && refreshToken ? { ...tokens, accessToken, refreshToken } : null;
  }
}
