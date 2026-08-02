import { Injectable, signal } from '@angular/core';
import { Observable, of } from 'rxjs';

import { StorageService } from './storage.service';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  readonly isAuthenticated = signal(false);

  constructor(private readonly storageService: StorageService) { }

  initialize(): void {
    const token = this.storageService.getJwtToken();
    this.isAuthenticated.set(Boolean(token));
  }

  login(): Observable<{ success: boolean }> {
    this.storageService.setJwtToken('placeholder-token');
    this.isAuthenticated.set(true);

    return of({ success: true });
  }

  register(): Observable<{ success: boolean }> {
    return of({ success: true });
  }

  forgotPassword(): Observable<{ success: boolean }> {
    return of({ success: true });
  }

  resetPassword(token: string | null = null): Observable<{ success: boolean }> {
    void token;

    return of({ success: true });
  }

  logout(): Observable<{ success: boolean }> {
    this.storageService.removeJwtToken();
    this.isAuthenticated.set(false);

    return of({ success: true });
  }

  refreshToken(): Observable<{ success: boolean }> {
    this.initialize();

    return of({ success: true });
  }
}
