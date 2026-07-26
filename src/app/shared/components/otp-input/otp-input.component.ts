import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

@Component({
  selector: 'app-otp-input',
  standalone: true,
  template: `
    <div class="otp-input" role="group" [attr.aria-label]="label()">
      @for (index of indices(); track index) {
        <input
          type="text"
          inputmode="numeric"
          maxlength="1"
          class="otp-input__field"
          [value]="digits()[index] ?? ''"
          (input)="handleInput($event, index)"
          (keydown)="handleKeydown($event, index)"
          (paste)="handlePaste($event)"
        />
      }
    </div>
  `,
  styleUrls: ['./otp-input.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OtpInputComponent {
  label = input('OTP');
  length = input(6);
  valueChange = output<string>();

  readonly digits = signal<string[]>([]);
  readonly indices = computed(() => Array.from({ length: this.length() }, (_, index) => index));

  handleInput(event: Event, index: number): void {
    const input = event.target as HTMLInputElement;
    const value = input.value.replace(/\D/g, '').slice(0, 1);
    const nextDigits = [...this.digits()];
    nextDigits[index] = value;
    this.digits.set(nextDigits);
    this.valueChange.emit(nextDigits.join(''));
  }

  handleKeydown(event: KeyboardEvent, index: number): void {
    if (event.key === 'Backspace' && !this.digits()[index]) {
      const nextDigits = [...this.digits()];
      nextDigits[index - 1] = '';
      this.digits.set(nextDigits);
      this.valueChange.emit(nextDigits.join(''));
    }
  }

  handlePaste(event: ClipboardEvent): void {
    event.preventDefault();
    const value = event.clipboardData?.getData('text') ?? '';
    const nextDigits = value.replace(/\D/g, '').split('').slice(0, this.length());
    this.digits.set(nextDigits);
    this.valueChange.emit(nextDigits.join(''));
  }
}
