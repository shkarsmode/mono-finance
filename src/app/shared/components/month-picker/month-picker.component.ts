import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, Output, signal } from '@angular/core';

const MONTHS = ['Січ', 'Лют', 'Бер', 'Кві', 'Тра', 'Чер', 'Лип', 'Сер', 'Вер', 'Жов', 'Лис', 'Гру'];
const FIRST_YEAR = 2017;

/**
 * Jump straight to any month: a year stepper over a 12-month grid. Reaching June 2024
 * from October 2026 used to take 28 clicks on the arrows.
 */
@Component({
    selector: 'app-month-picker',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="mp" role="dialog" aria-label="Вибір місяця" (keydown.escape)="close.emit()">
            <div class="mp__year">
                <button type="button" class="mp__step" (click)="shiftYear(-1)" [disabled]="viewYear() <= firstYear" aria-label="Попередній рік">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
                </button>
                <span class="mp__label num">{{ viewYear() }}</span>
                <button type="button" class="mp__step" (click)="shiftYear(1)" [disabled]="viewYear() >= nowYear" aria-label="Наступний рік">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
                </button>
            </div>

            <div class="mp__grid">
                @for (name of months; track name; let i = $index) {
                    <button type="button"
                            class="mp__m"
                            [class.mp__m--on]="viewYear() === year && i + 1 === month"
                            [class.mp__m--now]="viewYear() === nowYear && i + 1 === nowMonth"
                            [disabled]="isFuture(i + 1)"
                            [attr.aria-pressed]="viewYear() === year && i + 1 === month"
                            (click)="pick.emit({ month: i + 1, year: viewYear() })">
                        {{ name }}
                    </button>
                }
            </div>

            <button type="button" class="mp__today" (click)="pick.emit({ month: nowMonth, year: nowYear })">Цей місяць</button>
        </div>
    `,
    styles: [`
        :host { display: block; }

        .mp {
            width: 248px;
            padding: var(--space-3);
            background: var(--surface);
            border: 1px solid var(--line-2);
            border-radius: var(--radius-md);
            box-shadow: var(--shadow-pop);
            animation: mp-in 180ms var(--ease-out);
        }

        @keyframes mp-in {
            from { opacity: 0; transform: translateY(6px); }
            to { opacity: 1; transform: none; }
        }

        .mp__year {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: var(--space-2);
        }

        .mp__label { font-size: var(--fs-h3); font-weight: 600; }

        .mp__step {
            display: grid;
            place-items: center;
            width: 30px;
            height: 30px;
            border: 0;
            border-radius: var(--radius-sm);
            background: none;
            color: var(--ink-2);
            cursor: pointer;

            svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; }
            &:hover:not(:disabled) { background: var(--hover); color: var(--ink); }
            &:disabled { opacity: .35; cursor: default; }
        }

        .mp__grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: var(--space-1);
        }

        .mp__m {
            position: relative;
            height: 36px;
            border: 0;
            border-radius: var(--radius-sm);
            background: none;
            color: var(--ink);
            font: inherit;
            font-size: var(--fs-meta);
            cursor: pointer;

            &:hover:not(:disabled) { background: var(--hover); }
            &:disabled { color: var(--ink-3); opacity: .45; cursor: default; }

            &--now::after {
                content: '';
                position: absolute;
                left: 50%;
                bottom: 5px;
                width: 4px;
                height: 4px;
                margin-left: -2px;
                border-radius: 50%;
                background: var(--accent);
            }

            &--on {
                background: var(--btn);
                color: var(--btn-ink);
                font-weight: 600;
                &:hover:not(:disabled) { background: var(--btn-hover); }
                &::after { background: var(--btn-ink); }
            }
        }

        .mp__today {
            width: 100%;
            height: 30px;
            margin-top: var(--space-2);
            border: 1px solid var(--line-2);
            border-radius: var(--radius-sm);
            background: var(--surface);
            color: var(--ink-2);
            font: inherit;
            font-size: var(--fs-micro);
            font-weight: 500;
            cursor: pointer;
            &:hover { background: var(--hover); color: var(--ink); }
        }
    `],
})
export class MonthPickerComponent implements AfterViewInit {
    @Input() public month = new Date().getMonth() + 1;
    @Input() public set year(value: number) {
        this.selectedYear = value;
        this.viewYear.set(value);
    }
    public get year(): number { return this.selectedYear; }

    @Output() public readonly pick = new EventEmitter<{ month: number; year: number }>();
    @Output() public readonly close = new EventEmitter<void>();

    private selectedYear = new Date().getFullYear();
    public readonly months = MONTHS;
    public readonly firstYear = FIRST_YEAR;
    public readonly nowYear = new Date().getFullYear();
    public readonly nowMonth = new Date().getMonth() + 1;
    public readonly viewYear = signal(new Date().getFullYear());

    constructor(private readonly host: ElementRef<HTMLElement>) {}

    public ngAfterViewInit(): void {
        // start on the selected month, so Enter confirms and arrows have a place to begin
        queueMicrotask(() => this.host.nativeElement.querySelector<HTMLButtonElement>('.mp__m--on, .mp__m:not(:disabled)')
            ?.focus({ preventScroll: true }));
    }

    public shiftYear(delta: number): void {
        this.viewYear.update(y => Math.min(this.nowYear, Math.max(FIRST_YEAR, y + delta)));
    }

    public isFuture(month: number): boolean {
        const y = this.viewYear();
        return y > this.nowYear || (y === this.nowYear && month > this.nowMonth);
    }
}
