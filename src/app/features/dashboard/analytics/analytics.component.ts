import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-analytics',
  standalone: true,
  template: '<section><h1>Analytics</h1></section>',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AnalyticsComponent {}
