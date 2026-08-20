import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';

import { AuthService } from '../services/auth.service';
import { StorageService } from '../services/storage.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const storageService = inject(StorageService);
  const authService = inject(AuthService);
  const token = storageService.getAccessToken();

  const authReq = req.clone({
    setHeaders: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      const isUnauthorized = error.status === 401;
      const isRefreshRequest = req.url.includes('/auth/refresh');
      const hasRefreshToken = Boolean(storageService.getRefreshToken());

      if (!isUnauthorized || isRefreshRequest || !hasRefreshToken || req.headers.has('x-retry')) {
        return throwError(() => error);
      }

      return authService.refreshToken().pipe(
        switchMap(() => {
          const refreshedToken = storageService.getAccessToken();
          const retriedReq = req.clone({
            setHeaders: {
              Accept: 'application/json',
              ...(refreshedToken ? { Authorization: `Bearer ${refreshedToken}` } : {})
            },
            headers: req.headers.set('x-retry', 'true')
          });

          return next(retriedReq);
        }),
        catchError(() => throwError(() => error))
      );
    })
  );
};
