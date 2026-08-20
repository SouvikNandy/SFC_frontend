import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
    selector: 'app-closed-trades',
    standalone: true,
    template: `
    <section class="sfc-page">
      <h1>Closed Trades</h1>
      <p>Closed trades placeholder.</p>
    </section>
  `,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ClosedTradesComponent { }
