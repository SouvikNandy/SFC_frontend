import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { LiveDataAccessService } from './live-data-access.service';
import { LiveDataLoginRequiredComponent } from './live-data-login-required.component';
import { LiveDataUnavailableComponent } from './live-data-unavailable.component';
import { LiveDataService } from './live-data.service';

/**
 * The Live Data view a screen renders *instead of* its EOD/Custom UI.
 *   not signed in → LiveDataLoginRequiredComponent
 *   signed in     → feed state; LiveDataUnavailableComponent until the live API/WebSocket exists
 */
@Component({
    selector: 'app-live-data-access',
    standalone: true,
    imports: [LiveDataLoginRequiredComponent, LiveDataUnavailableComponent],
    template: `
        <section class="live-view" aria-labelledby="live-data-heading">
            <p id="live-data-heading" class="live-view-title">Live Data</p>
            @switch (access.access()) {
                @case ('login-required') {
                    <app-live-data-login-required [description]="description()"></app-live-data-login-required>
                }
                @case ('granted') {
                    @switch (feed.status()) {
                        @case ('unavailable') {
                            <app-live-data-unavailable [description]="description()"></app-live-data-unavailable>
                        }
                    }
                }
            }
        </section>
    `,
    styleUrl: './live-data-access.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LiveDataAccessComponent {
    readonly access = inject(LiveDataAccessService);
    readonly feed = inject(LiveDataService);

    /** What live data adds on the host screen, e.g. "spot prices and implied volatility". */
    readonly description = input.required<string>();
}
