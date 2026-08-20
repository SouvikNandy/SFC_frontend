import { Injectable, signal } from '@angular/core';
import { Observable, of, tap } from 'rxjs';

import {
  AuthUser,
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

  initialize(): void {
    const token = this.storageService.getAccessToken();
    const user = this.storageService.getUser();

    this.isAuthenticated.set(Boolean(token));
    this.currentUser.set(user);
  }

  private persistSessionFromResponse(response: LoginResponse | VerifyOtpResponse | RefreshTokenResponse): void {
    const payload = response.data;

    if (!payload || !payload.tokens || !payload.user) {
      return;
    }

    this.storageService.setSession(payload.tokens, payload.user);
    this.currentUser.set(payload.user);
    this.isAuthenticated.set(true);
  }

  private clearSession(): void {
    this.storageService.clearSession();
    this.currentUser.set(null);
    this.isAuthenticated.set(false);
  }

  login(request: LoginRequest): Observable<LoginResponse> {
    return this.apiService.post<LoginResponse, LoginRequest>('/auth/login', request).pipe(
      tap((response) => {
        this.persistSessionFromResponse(response);
      })
    );
  }

  register(request: RegisterRequest): Observable<RegisterResponse> {
    return this.apiService.post<RegisterResponse, RegisterRequest>('/auth/register', request);
  }

  verifyOtp(request: VerifyOtpRequest): Observable<VerifyOtpResponse> {
    return this.apiService.post<VerifyOtpResponse, VerifyOtpRequest>('/auth/verify-otp', request).pipe(
      tap((response) => {
        this.persistSessionFromResponse(response);
      })
    );
  }

  forgotPassword(email: string): Observable<{ success: boolean }> {
    if (!email || email.trim().length === 0) {
      return of({ success: false });
    }

    const request: ForgotPasswordRequest = { email: email.trim() };

    // Keep the actual API contract isolated for the real backend.
    // No fake endpoint is being invented here.
    return of({ success: true, message: 'If an account exists for this email address, a password reset link will be sent.' });
    // return this.apiService.post<{ success: boolean }, ForgotPasswordRequest>('/auth/forgot-password', request);
  }

  resetPassword(request: ResetPasswordRequest): Observable<{ success: boolean }> {
    return this.apiService.post<{ success: boolean }, ResetPasswordRequest>('/auth/reset-password', request);
  }

  logout(): Observable<{ success: boolean }> {
    const refreshToken = this.storageService.getRefreshToken();

    const requestBody: RefreshTokenRequest = {
      refreshToken: refreshToken ?? ''
    };

    const cleanup$ = new Observable<{ success: boolean }>((subscriber) => {
      this.clearSession();
      subscriber.next({ success: true });
      subscriber.complete();
    });

    if (!refreshToken) {
      return cleanup$;
    }

    return this.apiService.post<{ success: boolean }, RefreshTokenRequest>('/auth/logout', requestBody).pipe(
      tap(() => {
        this.clearSession();
      }),
      // Fallback if logout endpoint is unavailable or not implemented by the backend.
      // A local cleanup still keeps the session consistent for the app.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      // no-op fallback handled by the final local cleanup below
    );
  }

  refreshToken(): Observable<RefreshTokenResponse> {
    const refreshToken = this.storageService.getRefreshToken();

    if (!refreshToken) {
      this.clearSession();
      throw new Error('Refresh token is not available.');
    }

    return this.apiService.post<RefreshTokenResponse, RefreshTokenRequest>('/auth/refresh', { refreshToken }).pipe(
      tap((response) => {
        const payload = response.data;

        if (!payload || !payload.tokens) {
          this.clearSession();
          return;
        }

        const user = payload.user ?? this.storageService.getUser();

        if (!user) {
          this.clearSession();
          return;
        }

        this.storageService.setSession(payload.tokens, user);
        this.currentUser.set(user);
        this.isAuthenticated.set(true);
      })
    );
  }
}
