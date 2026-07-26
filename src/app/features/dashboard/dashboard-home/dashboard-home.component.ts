import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-dashboard-home',
  standalone: true,
  template: '<section><h1>Dashboard Home</h1></section>',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardHomeComponent {}
