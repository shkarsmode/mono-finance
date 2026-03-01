import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

@Component({
    selector: 'app-button',
    standalone: true,
    template: `
        <button
            [class]="'btn btn--' + variant()"
            [class.btn--loading]="loading()"
            [disabled]="disabled() || loading()"
            [type]="type()">
            @if (loading()) {
                <span class="btn__spinner" aria-hidden="true"></span>
            }
            <span class="btn__content" [class.btn__content--hidden]="loading()">
                <ng-content></ng-content>
            </span>
        </button>
    `,
    styles: [`
        :host { display: inline-flex; }

        .btn {
            &:focus-visible {
                outline: 2px solid var(--color-primary);
                outline-offset: 2px;
            }
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: var(--space-2);
            padding: 10px 20px;
            border-radius: var(--radius-sm);
            font-family: var(--font-family-base);
            font-size: var(--text-sm);
            font-weight: 500;
            line-height: 1;
            border: 1px solid transparent;
            cursor: pointer;
            user-select: none;
            transition: all var(--duration-fast) var(--ease-default);
            position: relative;

            &:active:not(:disabled) { transform: translateY(1px); }
            &:disabled { opacity: 0.5; cursor: not-allowed; }
        }

        .btn--primary {
            background: var(--color-primary);
            color: var(--color-primary-text);
            &:hover:not(:disabled) { background: var(--color-primary-hover); }
            &:active:not(:disabled) { background: var(--color-primary-active); }
        }

        .btn--secondary {
            background: var(--color-surface);
            color: var(--color-text-primary);
            border-color: var(--color-border);
            &:hover:not(:disabled) { background: var(--color-surface-hover); }
        }

        .btn--ghost {
            background: transparent;
            color: var(--color-text-secondary);
            &:hover:not(:disabled) {
                background: var(--color-surface-hover);
                color: var(--color-text-primary);
            }
        }

        .btn--danger {
            background: var(--color-error);
            color: #fff;
            &:hover:not(:disabled) { filter: brightness(0.9); }
        }

        .btn__spinner {
            width: 16px;
            height: 16px;
            border-radius: 50%;
            border: 2px solid rgba(255, 255, 255, 0.3);
            border-top-color: currentColor;
            animation: spin 0.7s linear infinite;
        }

        .btn__content--hidden { visibility: hidden; }

        .btn--loading { position: relative; }
        .btn--loading .btn__spinner {
            position: absolute;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
        }

        @keyframes spin { to { transform: translate(-50%, -50%) rotate(360deg); } }
    `],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppButtonComponent {
    variant = input<ButtonVariant>('primary');
    loading = input(false);
    disabled = input(false);
    type = input<'button' | 'submit'>('button');
}
