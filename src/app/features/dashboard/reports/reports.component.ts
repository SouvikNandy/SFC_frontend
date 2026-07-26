import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-reports',
  standalone: true,
  template: '<section><h1>Reports</h1></section>',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ReportsComponent {}
