import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-login',
  standalone: true,
  template: '<section><h1>Login</h1></section>',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoginComponent {}
