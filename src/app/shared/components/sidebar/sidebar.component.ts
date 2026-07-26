import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  template: '<aside class="sidebar"><ng-content /></aside>',
  styles: [
    `
      :host {
        display: block;
      }

      .sidebar {
        width: 280px;
        min-height: 100%;
        padding: 1.5rem;
        border-right: 1px solid var(--color-border, #e5e7eb);
      }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SidebarComponent {}
