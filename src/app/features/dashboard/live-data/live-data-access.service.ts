import { Injectable, computed, inject } from '@angular/core';
import { ActivatedRouteSnapshot } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { LIVE_SOURCE_PARAM, LIVE_SOURCE_VALUE, LiveDataAccess } from './live-data.model';

@Injectable({ providedIn: 'root' })
export class LiveDataAccessService {
    private readonly auth = inject(AuthService);

    /** Single decision point for live-data access; derived from the existing auth state. */
    readonly access = computed<LiveDataAccess>(() => (this.auth.isAuthenticated() ? 'granted' : 'login-required'));

    /** True when the user came back from sign-in and asked to reopen the Live tab. */
    requestedLive(route: ActivatedRouteSnapshot): boolean {
        return route.queryParamMap.get(LIVE_SOURCE_PARAM) === LIVE_SOURCE_VALUE;
    }
}
