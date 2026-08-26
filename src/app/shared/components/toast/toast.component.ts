import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from '../../../core/services/toast.service';

@Component({
    selector: 'app-toast',
    standalone: true,
    template: `
        <div class="toast-stack" aria-live="polite" aria-atomic="true">
            @for (toast of toastService.messages(); track toast.id) {
                <div class="toast" [class.toast--error]="toast.type === 'error'" [class.toast--success]="toast.type === 'success'" role="status">
                    <span>{{ toast.message }}</span>
                    <button type="button" aria-label="Dismiss notification" (click)="toastService.dismiss(toast.id)">×</button>
                </div>
            }
        </div>
    `,
    styleUrls: ['./toast.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ToastComponent {
    readonly toastService = inject(ToastService);
}
