import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  template: '<section><h1>Forgot Password</h1></section>',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ForgotPasswordComponent {}
