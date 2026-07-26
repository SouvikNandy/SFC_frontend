import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-dashboard-tools',
  standalone: true,
  template: '<section><h1>Dashboard Tools</h1></section>',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardToolsComponent {}
