import { ChangeDetectionStrategy, Component, OnDestroy, signal } from '@angular/core';

export interface ToastConfig {
    message: string;
    type: 'success' | 'error' | 'info';
    duration?: number;
}

@Component({
    selector: 'app-toast',
    standalone: true,
    template: `
        @for (toast of toasts(); track toast.id) {
            <div
                class="toast"
                [class]="'toast toast--' + toast.type"
                [class.toast--exit]="toast.exiting"
                (click)="dismiss(toast.id)">
                <span class="toast__icon">
                    @switch (toast.type) {
                        @case ('success') { ✅ }
                        @case ('error') { ❌ }
                        @default { ℹ️ }
                    }
                </span>
                <span class="toast__message">{{ toast.message }}</span>
            </div>
        }
    `,
    styles: [`
        :host {
            position: fixed;
            top: var(--space-5);
            right: var(--space-5);
            z-index: var(--z-toast);
            display: flex;
            flex-direction: column;
            gap: var(--space-2);
            pointer-events: none;
        }

        .toast {
            display: flex;
            align-items: center;
            gap: var(--space-3);
            padding: var(--space-3) var(--space-4);
            border-radius: var(--radius-sm);
            background: var(--color-surface-elevated);
            border: 1px solid var(--color-border);
            box-shadow: var(--shadow-3);
            font-size: var(--text-sm);
            color: var(--color-text-primary);
            pointer-events: auto;
            cursor: pointer;
            max-width: 400px;
            animation: toast-in var(--duration-normal) var(--ease-bounce);
            transition: all var(--duration-normal) var(--ease-default);

            &:hover { box-shadow: var(--shadow-4); }
        }

        .toast--success { border-left: 3px solid var(--color-success); }
        .toast--error { border-left: 3px solid var(--color-error); }
        .toast--info { border-left: 3px solid var(--color-primary); }

        .toast--exit {
            opacity: 0;
            transform: translateX(100%);
        }

        .toast__icon { font-size: 18px; flex-shrink: 0; }
        .toast__message { flex: 1; }

        @keyframes toast-in {
            from { opacity: 0; transform: translateX(40px); }
            to { opacity: 1; transform: translateX(0); }
        }
    `],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppToastComponent implements OnDestroy {
    private counter = 0;
    private timers: ReturnType<typeof setTimeout>[] = [];

    toasts = signal<Array<{
        id: number;
        message: string;
        type: 'success' | 'error' | 'info';
        exiting: boolean;
    }>>([]);

    show(config: ToastConfig): void {
        const id = ++this.counter;
        this.toasts.update(list => [...list, {
            id,
            message: config.message,
            type: config.type,
            exiting: false,
        }]);

        const timer = setTimeout(() => this.dismiss(id), config.duration ?? 4000);
        this.timers.push(timer);
    }

    dismiss(id: number): void {
        this.toasts.update(list =>
            list.map(t => t.id === id ? { ...t, exiting: true } : t)
        );
        setTimeout(() => {
            this.toasts.update(list => list.filter(t => t.id !== id));
        }, 250);
    }

    ngOnDestroy(): void {
        this.timers.forEach(t => clearTimeout(t));
    }
}

// Global toast service
import { ComponentRef, Injectable, ViewContainerRef } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ToastService {
    private componentRef: ComponentRef<AppToastComponent> | null = null;

    init(viewContainerRef: ViewContainerRef): void {
        if (!this.componentRef) {
            this.componentRef = viewContainerRef.createComponent(AppToastComponent);
        }
    }

    success(message: string): void {
        this.componentRef?.instance.show({ message, type: 'success' });
    }

    error(message: string): void {
        this.componentRef?.instance.show({ message, type: 'error', duration: 6000 });
    }

    info(message: string): void {
        this.componentRef?.instance.show({ message, type: 'info' });
    }
}
