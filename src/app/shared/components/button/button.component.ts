import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-button',
  standalone: true,
  template: `
    <button
      type="button"
      class="btn"
      [class]="buttonClass()"
      [disabled]="disabled()"
      [attr.aria-busy]="loading() ? 'true' : null"
    >
      @if (loading()) {
        <span class="btn__spinner" aria-hidden="true"></span>
      }
      <span class="btn__content">
        <ng-content></ng-content>
      </span>
    </button>
  `,
  styleUrls: ['./button.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ButtonComponent {
  variant = input<'primary' | 'secondary' | 'ghost' | 'danger'>('primary');
  size = input<'sm' | 'md' | 'lg'>('md');
  disabled = input(false);
  loading = input(false);
  pill = input(false);

  readonly buttonClass = computed(() => {
    const classes = ['btn', `btn--${this.variant()}`];

    if (this.size() === 'sm') {
      classes.push('btn--sm');
    } else if (this.size() === 'lg') {
      classes.push('btn--lg');
    }

    if (this.pill()) {
      classes.push('btn--pill');
    }

    return classes.join(' ');
  });
}
