import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { DISCLAIMER_ACCEPT_LABEL } from '../../../shared/legal/disclaimer';
import { RegisterComponent } from './register.component';

describe('RegisterComponent disclaimer acknowledgement', () => {
  const register = vi.fn();

  const create = () => {
    const fixture = TestBed.createComponent(RegisterComponent);
    fixture.detectChanges();
    return fixture;
  };
  const fill = (component: RegisterComponent, accept: boolean) =>
    component.form.setValue({ fullName: 'Anjali Mehta', email: 'anjali@example.com', phone: '9876543210', password: 'longenough1', acceptDisclaimer: accept });

  beforeEach(() => {
    register.mockReset().mockReturnValue(of({ success: true }));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { register } },
        { provide: ToastService, useValue: { error: vi.fn(), success: vi.fn() } },
      ],
    });
  });

  it('shows the required checkbox with the client label, linking to /disclaimer', () => {
    const root = create().nativeElement as HTMLElement;
    const label = root.querySelector('label[for="register-disclaimer"]')!;
    expect(label.textContent?.replace(/\s+/g, ' ').trim()).toBe(DISCLAIMER_ACCEPT_LABEL);
    expect(label.querySelector('a')?.textContent).toBe('Disclaimer');
    expect(label.querySelector('a')?.getAttribute('href')).toBe('/disclaimer');
    expect((root.querySelector('#register-disclaimer') as HTMLInputElement).checked).toBe(false);
  });

  it('blocks account creation until the box is ticked, even when every other field is valid', () => {
    const fixture = create();
    const component = fixture.componentInstance;
    fill(component, false);
    expect(component.form.invalid).toBe(true);
    const submit = (fixture.nativeElement as HTMLElement).querySelector('button[type="submit"]') as HTMLButtonElement;
    fixture.detectChanges();
    expect(submit.disabled).toBe(true);
    component.onSubmit();
    fixture.detectChanges();
    expect(register).not.toHaveBeenCalled();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Accept the Disclaimer to create your account.');
  });

  it('creates the account, with unchanged registration details, once the box is ticked', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = create();
    const component = fixture.componentInstance;
    fill(component, true);
    fixture.detectChanges();
    expect(((fixture.nativeElement as HTMLElement).querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(false);
    component.onSubmit();
    expect(register).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledWith({ first_name: 'Anjali', last_name: 'Mehta', email: 'anjali@example.com', method: 'direct', phone: '9876543210', password: 'longenough1' });
    expect(navigate).toHaveBeenCalledWith('/verify-otp');
  });

  it('keeps the existing Terms and Privacy Policy links', () => {
    const hrefs = Array.from((create().nativeElement as HTMLElement).querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/terms-conditions');
    expect(hrefs).toContain('/privacy-policy');
  });
});
