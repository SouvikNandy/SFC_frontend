import { Injectable, signal } from '@angular/core';
import { LiveFeedStatus } from './live-data.model';

/**
 * Integration point for the future live REST API and WebSocket feed.
 * No backend contract exists yet, so the feed reports 'unavailable' and
 * no market data is produced or simulated here.
 */
@Injectable({ providedIn: 'root' })
export class LiveDataService {
    readonly status = signal<LiveFeedStatus>('unavailable');
}
