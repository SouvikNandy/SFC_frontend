import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-input',
  standalone: true,
  template: `
    <label class="form-field" [attr.for]="id()">
      @if (label()) {
        <span class="form-field__label">{{ label() }}</span>
      }
      <input
        [id]="id()"
        [type]="type()"
        [name]="name()"
        [placeholder]="placeholder()"
        [value]="value()"
        [disabled]="disabled()"
        [required]="required()"
        class="form-field__input"
      />
      @if (hint()) {
        <span class="form-field__hint">{{ hint() }}</span>
      }
    </label>
  `,
  styleUrls: ['./input.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class InputComponent {
  label = input<string>('');
  placeholder = input<string>('');
  type = input<'text' | 'email' | 'password' | 'number'>('text');
  name = input<string>('');
  value = input<string>('');
  disabled = input(false);
  required = input(false);
  hint = input<string>('');
  id = input<string>(`input-${Math.random().toString(36).slice(2, 8)}`);
}
