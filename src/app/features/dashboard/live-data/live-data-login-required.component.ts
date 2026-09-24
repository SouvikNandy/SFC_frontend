import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { LIVE_SOURCE_PARAM, LIVE_SOURCE_VALUE } from './live-data.model';

/** Live Data for signed-out users: nothing but the sign-in prompt. */
@Component({
    selector: 'app-live-data-login-required',
    standalone: true,
    template: `
        <div class="live-state" role="region" aria-label="Live data sign-in required">
            <div class="live-state-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></svg>
            </div>
            <div class="live-state-copy">
                <p class="live-state-title">Login required</p>
                <p class="live-state-desc">Live market data is available for registered users. Sign in to access real-time {{ description() }}.</p>
            </div>
            <button type="button" class="calc" (click)="signIn()">Sign in</button>
        </div>
    `,
    styleUrl: './live-data-state.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LiveDataLoginRequiredComponent {
    private readonly router = inject(Router);
    readonly description = input.required<string>();

    /** Existing login flow; the return URL reopens this screen's Live tab. */
    signIn(): void {
        const current = this.router.parseUrl(this.router.url);
        current.queryParams = { ...current.queryParams, [LIVE_SOURCE_PARAM]: LIVE_SOURCE_VALUE };
        void this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.serializeUrl(current) } });
    }
}
