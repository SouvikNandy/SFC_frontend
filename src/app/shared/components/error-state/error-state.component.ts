import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-error-state',
  standalone: true,
  template: `
    <section class="error-state">
      <h3 class="error-state__title">{{ title() }}</h3>
      @if (description()) {
        <p class="error-state__description">{{ description() }}</p>
      }
      <ng-content></ng-content>
    </section>
  `,
  styleUrls: ['./error-state.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ErrorStateComponent {
  title = input('Something went wrong');
  description = input('');
}
