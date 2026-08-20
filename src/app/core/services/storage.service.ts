import { Injectable } from '@angular/core';

import { AuthUser, AuthTokenData } from '../models/auth.model';

@Injectable({
  providedIn: 'root'
})
export class StorageService {
  readonly accessTokenKey = 'auth-access-token';
  readonly refreshTokenKey = 'auth-refresh-token';
  readonly userKey = 'auth-user';

  get<T>(key: string): T | null {
    const value = window.localStorage.getItem(key);

    return value ? (JSON.parse(value) as T) : null;
  }

  set<T>(key: string, value: T): void {
    window.localStorage.setItem(key, JSON.stringify(value));
  }

  remove(key: string): void {
    window.localStorage.removeItem(key);
  }

  getAccessToken(): string | null {
    return this.get<string>(this.accessTokenKey);
  }

  setAccessToken(token: string): void {
    this.set(this.accessTokenKey, token);
  }

  removeAccessToken(): void {
    this.remove(this.accessTokenKey);
  }

  getRefreshToken(): string | null {
    return this.get<string>(this.refreshTokenKey);
  }

  setRefreshToken(token: string): void {
    this.set(this.refreshTokenKey, token);
  }

  removeRefreshToken(): void {
    this.remove(this.refreshTokenKey);
  }

  getUser(): AuthUser | null {
    return this.get<AuthUser>(this.userKey);
  }

  setUser(user: AuthUser): void {
    this.set(this.userKey, user);
  }

  removeUser(): void {
    this.remove(this.userKey);
  }

  setSession(tokens: AuthTokenData, user: AuthUser): void {
    this.setAccessToken(tokens.accessToken);
    this.setRefreshToken(tokens.refreshToken);
    this.setUser(user);
  }

  clearSession(): void {
    this.removeAccessToken();
    this.removeRefreshToken();
    this.removeUser();
  }

  getJwtToken(): string | null {
    return this.getAccessToken();
  }

  setJwtToken(token: string): void {
    this.setAccessToken(token);
  }

  removeJwtToken(): void {
    this.removeAccessToken();
  }
}
