import { Injectable, signal } from '@angular/core';

import { StorageService } from './storage.service';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  readonly isAuthenticated = signal(false);

  constructor(private readonly storageService: StorageService) {}

  initialize(): void {
    const token = this.storageService.getJwtToken();
    this.isAuthenticated.set(Boolean(token));
  }

  login(): void {
    this.storageService.setJwtToken('placeholder-token');
    this.isAuthenticated.set(true);
  }

  logout(): void {
    this.storageService.removeJwtToken();
    this.isAuthenticated.set(false);
  }

  refreshSession(): void {
    this.initialize();
  }
}
