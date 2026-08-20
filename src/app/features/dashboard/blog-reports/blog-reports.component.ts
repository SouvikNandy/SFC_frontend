import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
    selector: 'app-blog-reports',
    standalone: true,
    template: `
    <section class="sfc-page">
      <h1>Blog & Reports</h1>
      <p>Blog & Reports placeholder.</p>
    </section>
  `,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class BlogReportsComponent { }
