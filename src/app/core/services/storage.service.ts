import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class StorageService {
  readonly jwtKey = 'auth-token';

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

  getJwtToken(): string | null {
    return this.get<string>(this.jwtKey);
  }

  setJwtToken(token: string): void {
    this.set(this.jwtKey, token);
  }

  removeJwtToken(): void {
    this.remove(this.jwtKey);
  }
}
