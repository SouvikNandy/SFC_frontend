import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const isAuth = authService.isAuthenticated();

  console.log('[AuthGuard] Checking authentication - isAuthenticated:', isAuth);
  console.log('[AuthGuard] Current user:', authService.currentUser());

  if (isAuth) {
    console.log('[AuthGuard] Access granted');
    return true;
  }

  console.log('[AuthGuard] Access denied, redirecting to login');
  return router.createUrlTree(['/login']);
};

export const guestGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  return authService.isAuthenticated() ? router.createUrlTree(['/dashboard']) : true;
};

export const registrationGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  return authService.getRegistrationContext() ? true : router.createUrlTree(['/register']);
};
