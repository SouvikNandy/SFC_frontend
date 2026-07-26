import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { SidebarComponent } from '../../shared/components/sidebar/sidebar.component';

@Component({
  selector: 'app-dashboard-layout',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent],
  template: `
    <div class="dashboard-layout">
      <app-sidebar>
        <p class="sidebar-title">Dashboard</p>
      </app-sidebar>
      <div class="dashboard-content">
        <header class="topbar">
          <span>Workspace</span>
        </header>
        <main class="dashboard-main">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 100vh;
      }

      .dashboard-layout {
        min-height: 100vh;
        display: flex;
      }

      .dashboard-content {
        flex: 1;
        display: flex;
        flex-direction: column;
      }

      .topbar {
        padding: 1rem 1.5rem;
        border-bottom: 1px solid var(--color-border, #e5e7eb);
      }

      .dashboard-main {
        flex: 1;
        padding: 1.5rem;
      }

      .sidebar-title {
        font-weight: 700;
      }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardLayoutComponent {}
