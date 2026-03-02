import {
    ChangeDetectionStrategy, Component, ElementRef, EventEmitter,
    HostListener, inject, Input, Output, signal
} from '@angular/core';
import { TransactionSortBy } from '@core/enums';

@Component({
    selector: 'app-floating-toolbar',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <!-- Backdrop for outside-tap close -->
        @if (expanded()) {
            <div class="backdrop" (click)="close()"></div>
        }

        <div class="toolbar"
             [class.toolbar--expanded]="expanded()"
             [class.toolbar--closing]="closing()">
            <!-- Toggle button -->
            <button class="toolbar__toggle" (click)="toggle()">
                <span class="material-icons-round"
                      [style.transform]="expanded() ? 'rotate(0)' : 'rotate(-180deg)'"
                      style="transition: transform 0.25s ease">
                    expand_more
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
                                        [disabled]="currentYear === activeYear && m.value > currentMonth"
                                        (click)="onMonthSelect(m.value)">
                                    {{ m.name }}
                                </button>
                            }
                        </div>
                    </div>

                    <!-- Year pills -->
                    <div class="toolbar__section">
                        <span class="toolbar__label">Year</span>
                        <div class="pills pills--scroll">
                            @for (y of years; track y) {
                                <button class="pill"
                                        [class.pill--active]="y === activeYear"
                                        (click)="onYearSelect(y)">
                                    {{ y }}
                                </button>
                            }
                        </div>
                    </div>

                    <!-- Sort controls -->
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
                                      [style.transform]="sortDirection === 'asc' ? 'rotate(180deg)' : 'none'"
                                      style="transition: transform 0.2s ease">
                                    arrow_downward
                                </span>
                            </button>
                        </div>
                    </div>
                </div>
            } @else {
                <!-- Collapsed summary -->
                <div class="toolbar__summary" (click)="toggle()">
                    <span class="toolbar__summary-text">
                        {{ monthName }} {{ activeYear }}
                    </span>
                    <span class="toolbar__summary-divider">&middot;</span>
                    <span class="toolbar__summary-sort">
                        {{ sortLabel }}
                        <span class="material-icons-round"
                              style="font-size: 14px"
                              [style.transform]="sortDirection === 'asc' ? 'rotate(180deg)' : 'none'"
                              [style.transition]="'transform 0.2s ease'">
                            arrow_downward
                        </span>
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

        .backdrop {
            position: fixed;
            inset: 0;
            z-index: -1;
            pointer-events: auto;
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
            animation: slide-up 0.25s cubic-bezier(0.4, 0, 0.2, 1);

            &--expanded {
                flex-direction: column;
                align-items: stretch;
                padding: var(--space-3) var(--space-4);
                width: min(680px, calc(100vw - 32px));
                animation: expand-up 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
            }

            &--closing {
                animation: shrink-down 0.2s cubic-bezier(0.4, 0, 0.2, 1) forwards;
            }
        }

        @keyframes slide-up {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }

        @keyframes expand-up {
            from { opacity: 0.8; transform: scaleY(0.6); transform-origin: bottom; }
            to { opacity: 1; transform: scaleY(1); transform-origin: bottom; }
        }

        @keyframes shrink-down {
            from { opacity: 1; transform: scaleY(1); transform-origin: bottom; }
            to { opacity: 0.8; transform: scaleY(0.6); transform-origin: bottom; }
        }

        .toolbar__toggle {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 36px;
            height: 36px;
            border: none;
            background: none;
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
            cursor: pointer;
            user-select: none;
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
            animation: fade-in-content 0.25s ease 0.05s both;
        }

        @keyframes fade-in-content {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
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

            &--scroll {
                overflow-x: auto;
                flex-wrap: nowrap;
                scrollbar-width: none;
                -webkit-overflow-scrolling: touch;
                &::-webkit-scrollbar { display: none; }
            }
        }

        .pill {
            padding: 4px 10px;
            border: none;
            border-radius: var(--radius-full);
            font-size: var(--text-xs);
            font-weight: 500;
            font-family: var(--font-sans);
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

            &:disabled {
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
            border: none;
            border-radius: var(--radius-full);
            font-size: var(--text-xs);
            font-weight: 500;
            font-family: var(--font-sans);
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

        @media (max-width: 767px) {
            .toolbar--expanded {
                width: calc(100vw - 16px);
            }
        }
    `],
})
export class FloatingToolbarComponent {
    private readonly el = inject(ElementRef);

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
    readonly closing = signal(false);

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

    toggle(): void {
        if (this.expanded()) {
            this.close();
        } else {
            this.expanded.set(true);
        }
    }

    close(): void {
        this.closing.set(true);
        setTimeout(() => {
            this.expanded.set(false);
            this.closing.set(false);
        }, 200);
    }

    @HostListener('document:keydown.escape')
    onEscape(): void {
        if (this.expanded()) this.close();
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
