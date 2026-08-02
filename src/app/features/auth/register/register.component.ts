import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../../core/services/auth.service';

@Component({
    selector: 'app-register',
    standalone: true,
    imports: [ReactiveFormsModule, RouterLink],
    templateUrl: './register.component.html',
    styleUrls: ['./register.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class RegisterComponent {
    private readonly authService = inject(AuthService);
    private readonly router = inject(Router);

    readonly form = new FormGroup({
        fullName: new FormControl('', [Validators.required, Validators.minLength(2)]),
        email: new FormControl('', [Validators.required, Validators.email]),
        phone: new FormControl('', [Validators.required, Validators.minLength(6)]),
        password: new FormControl('', [Validators.required, Validators.minLength(8), Validators.maxLength(32)])
    });

    readonly isSubmitting = signal(false);
    readonly showPassword = signal(false);

    get fullNameControl(): AbstractControl {
        return this.form.controls.fullName;
    }

    get emailControl(): AbstractControl {
        return this.form.controls.email;
    }

    get phoneControl(): AbstractControl {
        return this.form.controls.phone;
    }

    get passwordControl(): AbstractControl {
        return this.form.controls.password;
    }

    onSubmit(): void {
        if (this.form.invalid) {
            this.form.markAllAsTouched();
            return;
        }

        this.isSubmitting.set(true);

        this.authService.register().subscribe({
            next: () => {
                window.setTimeout(() => {
                    this.isSubmitting.set(false);
                    this.router.navigateByUrl('/verify-otp');
                }, 700);
            },
            error: () => {
                this.isSubmitting.set(false);
            }
        });
    }

    togglePasswordVisibility(): void {
        this.showPassword.update((value) => !value);
    }

    getFullNameErrorMessage(): string | null {
        if (this.fullNameControl.hasError('required')) {
            return 'Enter your full name.';
        }

        if (this.fullNameControl.hasError('minlength')) {
            return 'Full name must be at least 2 characters long.';
        }

        return null;
    }

    getEmailErrorMessage(): string | null {
        if (this.emailControl.hasError('required')) {
            return 'Enter a valid email address.';
        }

        if (this.emailControl.hasError('email')) {
            return 'Please enter a valid email address.';
        }

        return null;
    }

    getPhoneErrorMessage(): string | null {
        if (this.phoneControl.hasError('required')) {
            return 'Enter your phone number.';
        }

        if (this.phoneControl.hasError('minlength')) {
            return 'Phone number must be at least 6 characters.';
        }

        return null;
    }

    getPasswordErrorMessage(): string | null {
        if (this.passwordControl.hasError('required')) {
            return 'Password must be at least 8 characters.';
        }

        if (this.passwordControl.hasError('minlength')) {
            return 'Password must be at least 8 characters long.';
        }

        if (this.passwordControl.hasError('maxlength')) {
            return 'Password must not exceed 32 characters.';
        }

        return null;
    }
}
