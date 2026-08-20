import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
    selector: 'app-payoff',
    standalone: true,
    template: `
    <section class="sfc-page">
      <h1>Payoff Simulator</h1>
      <p>Payoff placeholder.</p>
    </section>
  `,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class PayoffComponent { }
