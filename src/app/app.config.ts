import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';

import { authInterceptor } from './core/interceptors/auth.interceptor';
import { routes } from './app.routes';
import { AuthService } from './core/services/auth.service';
import { ApiService } from './core/services/api.service';
import { StorageService } from './core/services/storage.service';
import { WebSocketService } from './core/services/web-socket.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    AuthService,
    ApiService,
    StorageService,
    WebSocketService
  ]
};
