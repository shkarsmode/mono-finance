import {
    AfterViewInit, ChangeDetectionStrategy, Component, computed, ElementRef, EventEmitter, Input, Output,
    signal, ViewChild,
} from '@angular/core';
import { AssignMode, categoryColor } from '@core/helpers/categorize';
import { ICategoryGroup } from '@core/interfaces';

type Option =
    | { kind: 'existing'; index: number; title: string; emoji: string; color: string }
    | { kind: 'create'; title: string };

/**
 * Pick — or create — the category for a transaction. Keyboard first: it opens with
 * the search focused, arrows move, Enter picks, Escape closes. By default the choice
 * applies to every transaction from the same merchant; untick to move only this one
 * (useful for card-to-card transfers that mean different things each time).
 */
@Component({
    selector: 'app-category-picker',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="picker" role="dialog" aria-label="Choose category" (keydown)="onKeydown($event)">
            <label class="picker__search">
                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.6-3.6" /></svg>
                <input #query
                       type="text"
                       placeholder="Find or create category"
                       autocomplete="off"
                       spellcheck="false"
                       [value]="term()"
                       (input)="onInput($event)"
                       aria-label="Find or create category" />
            </label>

            <ul class="picker__list" role="listbox">
                @for (option of options(); track $index; let i = $index) {
                    <li role="option"
                        class="picker__opt"
                        [class.picker__opt--active]="i === active()"
                        [attr.aria-selected]="i === active()"
                        (mouseenter)="active.set(i)"
                        (mousedown)="$event.preventDefault()"
                        (click)="choose(option)">
                        @if (option.kind === 'existing') {
                            <span class="picker__dot" [style.background]="option.color"></span>
                            <span class="picker__name">
                                @if (option.emoji) { <span class="emoji">{{ option.emoji }}</span> }
                                {{ option.title }}
                            </span>
                            @if (option.index === currentIndex) {
                                <svg class="picker__check" viewBox="0 0 24 24" aria-label="current"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                            }
                        } @else {
                            <svg class="picker__plus" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                            <span class="picker__name">Create <strong>“{{ option.title }}”</strong></span>
                        }
                    </li>
                } @empty {
                    <li class="picker__empty">Type a name to create a category</li>
                }
            </ul>

            @if (merchant) {
                <label class="picker__scope">
                    <input type="checkbox" [checked]="mode() === 'merchant'" (change)="toggleMode()" />
                    <span>
                        Every <strong>{{ merchant }}</strong> transaction
                        @if (merchantCount > 1) { <span class="num">· {{ merchantCount }} here</span> }
                    </span>
                </label>
            }
        </div>
    `,
    styles: [`
        :host { display: block; }

        .picker {
            width: 280px;
            background: var(--surface);
            border: 1px solid var(--line-2);
            border-radius: var(--radius-md);
            box-shadow: var(--shadow-pop);
            overflow: hidden;
            animation: picker-in 180ms var(--ease-out);
        }

        @keyframes picker-in {
            from { opacity: 0; transform: translateY(6px); }
            to { opacity: 1; transform: none; }
        }

        .picker__search {
            display: flex;
            align-items: center;
            gap: var(--space-2);
            padding: 0 var(--space-3);
            height: 40px;
            border-bottom: 1px solid var(--line);

            svg { width: 15px; height: 15px; flex: none; fill: none; stroke: var(--ink-3); stroke-width: 1.9; stroke-linecap: round; }

            input {
                flex: 1;
                min-width: 0;
                border: 0;
                outline: none;
                background: none;
                font: inherit;
                font-size: var(--fs-meta);
                color: var(--ink);
                &::placeholder { color: var(--ink-3); }
                &:focus-visible { box-shadow: none; }
            }
        }

        .picker__list {
            list-style: none;
            margin: 0;
            padding: var(--space-1);
            max-height: 264px;
            overflow-y: auto;
        }

        .picker__opt {
            display: flex;
            align-items: center;
            gap: var(--space-2);
            padding: 0 var(--space-2);
            height: 34px;
            border-radius: var(--radius-sm);
            font-size: var(--fs-meta);
            color: var(--ink);
            cursor: pointer;

            &--active { background: var(--hover); }
        }

        .picker__dot { width: 9px; height: 9px; border-radius: 2px; flex: none; }

        .picker__name {
            flex: 1;
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            strong { font-weight: 600; }
        }

        .picker__check, .picker__plus {
            width: 15px; height: 15px; flex: none;
            fill: none; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round;
        }
        .picker__check { stroke: var(--accent); }
        .picker__plus { stroke: var(--accent); }

        .picker__empty {
            padding: var(--space-3) var(--space-2);
            font-size: var(--fs-micro);
            color: var(--ink-3);
        }

        .picker__scope {
            display: flex;
            align-items: flex-start;
            gap: var(--space-2);
            padding: var(--space-3);
            border-top: 1px solid var(--line);
            background: var(--raised);
            font-size: var(--fs-micro);
            color: var(--ink-2);
            cursor: pointer;
            line-height: 1.4;

            input { margin: 1px 0 0; accent-color: var(--accent); flex: none; }
            strong { color: var(--ink); font-weight: 600; word-break: break-word; }
        }
    `],
})
export class CategoryPickerComponent implements AfterViewInit {
    @Input() public set groups(value: readonly ICategoryGroup[] | null) {
        this.groupList.set(value ?? []);
    }
    /** Category the transaction currently resolves to (-1 = uncategorized). */
    @Input() public currentIndex = -1;
    /** Merchant label; empty disables "every transaction from this merchant". */
    @Input() public merchant = '';
    @Input() public merchantCount = 0;

    @Output() public readonly pick = new EventEmitter<{ index: number; mode: AssignMode }>();
    @Output() public readonly create = new EventEmitter<{ title: string; mode: AssignMode }>();
    @Output() public readonly close = new EventEmitter<void>();

    @ViewChild('query') private readonly queryRef!: ElementRef<HTMLInputElement>;

    private readonly groupList = signal<readonly ICategoryGroup[]>([]);
    public readonly term = signal('');
    public readonly active = signal(0);
    public readonly mode = signal<AssignMode>('merchant');

    public readonly options = computed<Option[]>(() => {
        const term = this.term().trim();
        const needle = term.toLocaleLowerCase();

        const existing: Option[] = this.groupList()
            .map((group, index) => ({
                kind: 'existing' as const,
                index,
                title: group.title,
                emoji: group.emoji ?? '',
                color: categoryColor(index),
            }))
            .filter(option => !needle || option.title.toLocaleLowerCase().includes(needle));

        const exact = this.groupList().some(group => group.title.trim().toLocaleLowerCase() === needle);
        return term && !exact ? [...existing, { kind: 'create', title: term }] : existing;
    });

    public ngAfterViewInit(): void {
        if (!this.merchant) this.mode.set('single');
        // Focus without scrolling the page under the overlay.
        queueMicrotask(() => this.queryRef?.nativeElement.focus({ preventScroll: true }));
    }

    public onInput(event: Event): void {
        this.term.set((event.target as HTMLInputElement).value);
        this.active.set(0);
    }

    public toggleMode(): void {
        this.mode.update(mode => (mode === 'merchant' ? 'single' : 'merchant'));
    }

    public choose(option: Option): void {
        if (option.kind === 'existing') this.pick.emit({ index: option.index, mode: this.mode() });
        else this.create.emit({ title: option.title, mode: this.mode() });
    }

    public onKeydown(event: KeyboardEvent): void {
        const count = this.options().length;
        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                if (count) this.active.set((this.active() + 1) % count);
                break;
            case 'ArrowUp':
                event.preventDefault();
                if (count) this.active.set((this.active() - 1 + count) % count);
                break;
            case 'Enter': {
                event.preventDefault();
                const option = this.options()[this.active()];
                if (option) this.choose(option);
                break;
            }
            case 'Escape':
                event.preventDefault();
                event.stopPropagation();
                this.close.emit();
                break;
        }
    }
}
