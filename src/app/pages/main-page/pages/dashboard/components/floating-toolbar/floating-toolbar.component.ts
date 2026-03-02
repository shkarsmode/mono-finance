import {
    ChangeDetectionStrategy, Component, EventEmitter,
    Input, Output, signal
} from '@angular/core';
import { TransactionSortBy } from '@core/enums';

@Component({
    selector: 'app-floating-toolbar',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="toolbar" [class.toolbar--expanded]="expanded()">
            <!-- Collapse toggle -->
            <button class="toolbar__toggle" (click)="expanded.set(!expanded())">
                <span class="material-icons-round">
                    {{ expanded() ? 'expand_more' : 'tune' }}
                </span>
            </button>

            @if (expanded()) {
                <div class="toolbar__content">
                    <!-- Month pills -->
                    <div class="toolbar__section">
                        <span class="toolbar__label">Month</span>
                        <div class="pills">
                            @for (m of months; track m.value) {
                                <button class="pill"
                                        [class.pill--active]="m.value === activeMonth"
                                        [class.pill--disabled]="currentYear === activeYear && m.value > currentMonth"
                                        [disabled]="currentYear === activeYear && m.value > currentMonth"
                                        (click)="onMonthSelect(m.value)">
                                    {{ m.name }}
                                </button>
                            }
                        </div>
                    </div>

                    <!-- Year selector -->
                    <div class="toolbar__section">
                        <span class="toolbar__label">Year</span>
                        <div class="pills">
                            @for (y of years; track y) {
                                <button class="pill"
                                        [class.pill--active]="y === activeYear"
                                        (click)="onYearSelect(y)">
                                    {{ y }}
                                </button>
                            }
                        </div>
                    </div>

                    <!-- Sort -->
                    <div class="toolbar__section toolbar__section--sort">
                        <span class="toolbar__label">Sort</span>
                        <div class="sort-btns">
                            <button class="sort-btn"
                                    [class.sort-btn--active]="sortBy === SortBy.Date"
                                    (click)="onSort(SortBy.Date)">
                                <span class="material-icons-round">schedule</span>
                                Date
                            </button>
                            <button class="sort-btn"
                                    [class.sort-btn--active]="sortBy === SortBy.Amount"
                                    (click)="onSort(SortBy.Amount)">
                                <span class="material-icons-round">payments</span>
                                Amount
                            </button>
                            <button class="sort-btn"
                                    [class.sort-btn--active]="sortBy === SortBy.Payment"
                                    (click)="onSort(SortBy.Payment)">
                                <span class="material-icons-round">sort_by_alpha</span>
                                Name
                            </button>
                            <button class="sort-btn sort-btn--direction"
                                    (click)="toggleDirection()">
                                <span class="material-icons-round"
                                      [class.rotated]="sortDirection === 'asc'">
                                    arrow_downward
                                </span>
                            </button>
                        </div>
                    </div>
                </div>
            } @else {
                <!-- Collapsed: show current month/year -->
                <div class="toolbar__summary">
                    <span class="toolbar__summary-text">
                        {{ monthName }} {{ activeYear }}
                    </span>
                    <span class="toolbar__summary-divider">·</span>
                    <span class="toolbar__summary-sort">
                        {{ sortLabel }}
                        <span class="material-icons-round" style="font-size: 14px"
                              [class.rotated]="sortDirection === 'asc'">arrow_downward</span>
                    </span>
                </div>
            }
        </div>
    `,
    styles: [`
        :host {
            position: fixed;
            bottom: 16px;
            left: 50%;
            transform: translateX(-50%);
            z-index: var(--z-sticky);
            width: auto;
            max-width: calc(100vw - 32px);
            pointer-events: none;

            @media (max-width: 1023px) {
                bottom: 80px;
            }
        }

        .toolbar {
            pointer-events: auto;
            background: var(--color-surface-elevated);
            border: 1px solid var(--color-border);
            border-radius: var(--radius-lg);
            box-shadow: var(--shadow-4);
            backdrop-filter: blur(16px);
            padding: var(--space-2) var(--space-3);
            display: flex;
            align-items: center;
            gap: var(--space-3);
            transition: all var(--duration-normal) var(--ease-default);

            &--expanded {
                flex-direction: column;
                align-items: stretch;
                padding: var(--space-3) var(--space-4);
                width: min(680px, calc(100vw - 32px));
            }
        }

        .toolbar__toggle {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 36px;
            height: 36px;
            border-radius: var(--radius-sm);
            color: var(--color-text-secondary);
            cursor: pointer;
            transition: all var(--duration-fast);
            flex-shrink: 0;
            &:hover { background: var(--color-surface-hover); color: var(--color-text-primary); }
            .material-icons-round { font-size: 20px; }
        }

        .toolbar__summary {
            display: flex;
            align-items: center;
            gap: var(--space-2);
            white-space: nowrap;
        }

        .toolbar__summary-text {
            font-size: var(--text-sm);
            font-weight: 600;
            color: var(--color-text-primary);
        }

        .toolbar__summary-divider {
            color: var(--color-text-tertiary);
        }

        .toolbar__summary-sort {
            display: flex;
            align-items: center;
            gap: 2px;
            font-size: var(--text-xs);
            color: var(--color-text-secondary);
        }

        .toolbar__content {
            display: flex;
            flex-direction: column;
            gap: var(--space-3);
        }

        .toolbar__section {
            display: flex;
            flex-direction: column;
            gap: var(--space-1);
        }

        .toolbar__label {
            font-size: var(--text-xs);
            font-weight: 500;
            text-transform: uppercase;
            color: var(--color-text-tertiary);
            letter-spacing: 0.04em;
        }

        .pills {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
        }

        .pill {
            padding: 4px 10px;
            border-radius: var(--radius-full);
            font-size: var(--text-xs);
            font-weight: 500;
            color: var(--color-text-secondary);
            background: var(--color-surface-hover);
            cursor: pointer;
            transition: all var(--duration-fast);
            white-space: nowrap;

            &:hover:not(:disabled) {
                background: var(--color-surface-active);
                color: var(--color-text-primary);
            }

            &--active {
                background: var(--color-primary) !important;
                color: #fff !important;
            }

            &--disabled, &:disabled {
                opacity: 0.35;
                cursor: not-allowed;
            }
        }

        .sort-btns {
            display: flex;
            gap: 4px;
        }

        .sort-btn {
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 4px 10px;
            border-radius: var(--radius-full);
            font-size: var(--text-xs);
            font-weight: 500;
            color: var(--color-text-secondary);
            background: var(--color-surface-hover);
            cursor: pointer;
            transition: all var(--duration-fast);
            .material-icons-round { font-size: 14px; }

            &:hover {
                background: var(--color-surface-active);
                color: var(--color-text-primary);
            }

            &--active {
                background: var(--color-primary-subtle) !important;
                color: var(--color-primary) !important;
            }

            &--direction {
                width: 32px;
                padding: 4px;
                justify-content: center;
            }
        }

        .rotated {
            transform: rotate(180deg);
        }

        @media (max-width: 767px) {
            .toolbar--expanded {
                width: calc(100vw - 16px);
            }
        }
    `],
})
export class FloatingToolbarComponent {
    @Input() activeMonth = 1;
    @Input() activeYear = 2026;
    @Input() currentMonth = 1;
    @Input() currentYear = 2026;
    @Input() years: number[] = [];
    @Input() sortBy: TransactionSortBy = TransactionSortBy.Date;
    @Input() sortDirection: 'asc' | 'desc' = 'desc';

    @Output() monthChange = new EventEmitter<number>();
    @Output() yearChange = new EventEmitter<number>();
    @Output() sortChange = new EventEmitter<{ sortBy: TransactionSortBy; direction: 'asc' | 'desc' }>();

    readonly SortBy = TransactionSortBy;
    readonly expanded = signal(false);

    readonly months = [
        { name: 'Jan', value: 1 }, { name: 'Feb', value: 2 },
        { name: 'Mar', value: 3 }, { name: 'Apr', value: 4 },
        { name: 'May', value: 5 }, { name: 'Jun', value: 6 },
        { name: 'Jul', value: 7 }, { name: 'Aug', value: 8 },
        { name: 'Sep', value: 9 }, { name: 'Oct', value: 10 },
        { name: 'Nov', value: 11 }, { name: 'Dec', value: 12 },
    ];

    get monthName(): string {
        return this.months.find(m => m.value === this.activeMonth)?.name ?? '';
    }

    get sortLabel(): string {
        switch (this.sortBy) {
            case TransactionSortBy.Date: return 'Date';
            case TransactionSortBy.Amount: return 'Amount';
            case TransactionSortBy.Payment: return 'Name';
            default: return '';
        }
    }

    onMonthSelect(month: number): void {
        this.monthChange.emit(month);
    }

    onYearSelect(year: number): void {
        this.yearChange.emit(year);
    }

    onSort(sortBy: TransactionSortBy): void {
        if (sortBy === this.sortBy) {
            this.toggleDirection();
        } else {
            this.sortChange.emit({ sortBy, direction: this.sortDirection });
        }
    }

    toggleDirection(): void {
        const newDir = this.sortDirection === 'asc' ? 'desc' : 'asc';
        this.sortChange.emit({ sortBy: this.sortBy, direction: newDir });
    }
}
