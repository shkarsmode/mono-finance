import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
    selector: 'app-card',
    standalone: true,
    template: `
        <div class="card" [class]="'card--' + density()">
            <ng-content></ng-content>
        </div>
    `,
    styles: [`
        .card {
            background: var(--color-surface);
            border: 1px solid var(--color-border);
            border-radius: var(--radius-lg);
            box-shadow: var(--shadow-1);
            padding: var(--space-5);
            transition: all var(--duration-normal) var(--ease-default);

            &--compact { padding: var(--space-4); }
            &--spacious { padding: var(--space-6); }
        }

        :host(.hoverable) .card {
            transition: transform var(--duration-normal) var(--ease-default),
                        box-shadow var(--duration-normal) var(--ease-default);
            cursor: pointer;

            &:hover {
                transform: translateY(-2px);
                box-shadow: var(--shadow-3);
            }
        }
    `],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppCardComponent {
    density = input<'default' | 'compact' | 'spacious'>('default');
}
