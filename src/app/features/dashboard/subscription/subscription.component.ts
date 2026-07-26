import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-subscription',
  standalone: true,
  template: '<section><h1>Subscription</h1></section>',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SubscriptionComponent {}
