import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
    selector: 'app-skeleton',
    standalone: true,
    template: `
        @switch (variant()) {
            @case ('card') {
                <div class="skeleton skeleton--card">
                    <div class="skeleton__line skeleton__line--title"></div>
                    <div class="skeleton__line skeleton__line--value"></div>
                    <div class="skeleton__line skeleton__line--subtitle"></div>
                </div>
            }
            @case ('row') {
                <div class="skeleton skeleton--row">
                    <div class="skeleton__circle"></div>
                    <div class="skeleton__col">
                        <div class="skeleton__line skeleton__line--wide"></div>
                        <div class="skeleton__line skeleton__line--narrow"></div>
                    </div>
                    <div class="skeleton__line skeleton__line--amount"></div>
                </div>
            }
            @default {
                <div class="skeleton skeleton--block"></div>
            }
        }
    `,
    styles: [`
        @keyframes skeleton-shimmer {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
        }

        .skeleton {
            &--card {
                background: var(--color-surface);
                border: 1px solid var(--color-border);
                border-radius: var(--radius-lg);
                box-shadow: var(--shadow-1);
                padding: var(--space-5);
                display: flex;
                flex-direction: column;
                gap: var(--space-3);
            }

            &--row {
                display: flex;
                align-items: center;
                gap: var(--space-3);
                padding: var(--space-3) 0;
            }

            &--block {
                background: linear-gradient(90deg, var(--color-skeleton) 25%, var(--color-skeleton-shine) 50%, var(--color-skeleton) 75%);
                background-size: 200% 100%;
                animation: skeleton-shimmer 1.5s ease-in-out infinite;
                border-radius: var(--radius-sm);
                height: 100%;
                min-height: 40px;
            }
        }

        .skeleton__circle {
            background: linear-gradient(90deg, var(--color-skeleton) 25%, var(--color-skeleton-shine) 50%, var(--color-skeleton) 75%);
            background-size: 200% 100%;
            animation: skeleton-shimmer 1.5s ease-in-out infinite;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            flex-shrink: 0;
        }

        .skeleton__col {
            display: flex;
            flex-direction: column;
            gap: 6px;
            flex: 1;
        }

        .skeleton__line {
            background: linear-gradient(90deg, var(--color-skeleton) 25%, var(--color-skeleton-shine) 50%, var(--color-skeleton) 75%);
            background-size: 200% 100%;
            animation: skeleton-shimmer 1.5s ease-in-out infinite;
            border-radius: var(--radius-sm);
            height: 14px;

            &--title { width: 40%; height: 12px; }
            &--value { width: 60%; height: 28px; }
            &--subtitle { width: 50%; height: 12px; }
            &--wide { width: 80%; }
            &--narrow { width: 45%; height: 11px; }
            &--amount { width: 70px; height: 16px; flex-shrink: 0; }
        }
    `],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppSkeletonComponent {
    variant = input<'card' | 'row' | 'block'>('block');
}
