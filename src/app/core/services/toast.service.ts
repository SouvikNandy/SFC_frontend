import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'info' | 'error';

export interface ToastMessage {
    id: number;
    message: string;
    type: ToastType;
}

/** How long each kind of toast stays before it dismisses itself; every toast can also be dismissed by hand. */
export const TOAST_DURATION_MS: Readonly<Record<ToastType, number>> = { success: 3500, info: 3500, error: 7000 };

/**
 * The one notification channel of the app.
 *  - success: a short confirmation of something the user did;
 *  - info: neutral news the user should notice, e.g. a selection of theirs that an update replaced;
 *  - error: a failure. Failures that need the user to act stay on the screen instead (inline, with Retry), without a toast as well.
 * A toast identical to one still showing (same type and text) is not shown twice.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
    readonly messages = signal<ToastMessage[]>([]);
    private nextId = 0;

    success(message: string): void {
        this.show(message, 'success');
    }

    info(message: string): void {
        this.show(message, 'info');
    }

    error(message: string): void {
        this.show(message, 'error');
    }

    dismiss(id: number): void {
        this.messages.update(messages => messages.filter(message => message.id !== id));
    }

    private show(message: string, type: ToastType): void {
        if (this.messages().some(toast => toast.type === type && toast.message === message)) return;
        const id = ++this.nextId;
        this.messages.update(messages => [...messages, { id, message, type }]);
        window.setTimeout(() => this.dismiss(id), TOAST_DURATION_MS[type]);
    }
}
