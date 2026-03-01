import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
    selector: 'app-empty-state',
    standalone: true,
    template: `
        <div class="empty">
            <span class="empty__icon">{{ icon() }}</span>
            <h3 class="empty__title">{{ title() }}</h3>
            @if (description()) {
                <p class="empty__description">{{ description() }}</p>
            }
            <ng-content></ng-content>
        </div>
    `,
    styles: [`
        .empty {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            text-align: center;
            padding: var(--space-7) var(--space-5);
            gap: var(--space-3);
        }

        .empty__icon {
            font-size: 48px;
            line-height: 1;
            opacity: 0.6;
        }

        .empty__title {
            font-size: var(--text-lg);
            font-weight: 600;
            color: var(--color-text-primary);
        }

        .empty__description {
            font-size: var(--text-sm);
            color: var(--color-text-secondary);
            max-width: 360px;
        }
    `],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppEmptyStateComponent {
    icon = input('📭');
    title = input('Nothing here yet');
    description = input('');
}
