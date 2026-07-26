import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-dashboard-data',
  standalone: true,
  template: '<section><h1>Dashboard Data</h1></section>',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardDataComponent {}
