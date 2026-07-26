import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  template: '<section><h1>Reset Password</h1></section>',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ResetPasswordComponent {}
