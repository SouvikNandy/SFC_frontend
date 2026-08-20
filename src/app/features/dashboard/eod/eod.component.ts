import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
    selector: 'app-eod',
    standalone: true,
    template: `
    <section class="sfc-page">
      <h1>F&O EOD Data</h1>
      <p>EOD placeholder.</p>
    </section>
  `,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class EodComponent { }
