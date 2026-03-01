import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
    selector: 'app-chip',
    standalone: true,
    template: `
        <span class="chip" [class]="'chip--' + variant()">
            <ng-content></ng-content>
        </span>
    `,
    styles: [`
        .chip {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 4px 10px;
            border-radius: var(--radius-full);
            font-size: var(--text-xs);
            font-weight: 500;
            line-height: 1.2;
            white-space: nowrap;
        }

        .chip--default {
            background: var(--color-surface-hover);
            color: var(--color-text-secondary);
        }

        .chip--income {
            background: var(--color-success-subtle);
            color: var(--color-success-text);
        }

        .chip--expense {
            background: var(--color-error-subtle);
            color: var(--color-error-text);
        }

        .chip--primary {
            background: var(--color-primary-subtle);
            color: var(--color-primary);
        }
    `],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppChipComponent {
    variant = input<'default' | 'income' | 'expense' | 'primary'>('default');
}
