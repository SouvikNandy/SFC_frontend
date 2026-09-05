import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { AuthService } from '../../../../core/services/auth.service';
import { ToastService } from '../../../../core/services/toast.service';

@Component({
    selector: 'app-forgot-password-dialog',
    standalone: true,
    imports: [ReactiveFormsModule],
    templateUrl: './forgot-password-dialog.component.html',
    styleUrls: ['./forgot-password-dialog.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ForgotPasswordDialogComponent {
    private readonly authService = inject(AuthService);
    private readonly toast = inject(ToastService);

    @Input() isOpen = false;
    @Output() closed = new EventEmitter<void>();

    readonly form = new FormGroup({
        email: new FormControl('', [Validators.required, Validators.email])
    });

    readonly isSubmitted = signal(false);
    readonly isSubmitting = signal(false);

    onSubmit(): void {
        if (this.form.invalid) {
            this.form.markAllAsTouched();
            return;
        }

        const { email } = this.form.getRawValue();
        const emailValue = email ?? '';

        this.isSubmitting.set(true);

        this.authService.forgotPassword(emailValue).subscribe({
            next: () => { this.isSubmitting.set(false); this.isSubmitted.set(true); },
            error: () => { this.isSubmitting.set(false); this.toast.error('Unable to start the password reset. Please try again.'); }
        });
    }

    close(): void {
        this.closed.emit();
        this.isSubmitted.set(false);
        this.form.reset({ email: '' });
    }
}
