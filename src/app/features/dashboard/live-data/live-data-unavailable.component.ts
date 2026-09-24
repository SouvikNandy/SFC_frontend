import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Live Data for signed-in users while no live API/WebSocket exists. Shows no market data. */
@Component({
    selector: 'app-live-data-unavailable',
    standalone: true,
    template: `
        <div class="live-state" role="status" aria-label="Live data feed not available">
            <div class="live-state-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M4 19v-2"></path><path d="M9 19v-5"></path><path d="M14 19v-8"></path><path d="M19 19V7"></path><path d="M3 3l18 18"></path></svg>
            </div>
            <div class="live-state-copy">
                <p class="live-state-title">Real-time market data</p>
                <p class="live-state-desc">You're signed in, but the live market feed is not available yet. Real-time {{ description() }}
                    will appear here once the live API/WebSocket integration is enabled.</p>
            </div>
        </div>
    `,
    styleUrl: './live-data-state.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LiveDataUnavailableComponent {
    readonly description = input.required<string>();
}
