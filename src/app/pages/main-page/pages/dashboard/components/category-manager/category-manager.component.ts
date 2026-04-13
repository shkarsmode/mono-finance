import {
    ChangeDetectionStrategy, Component, EventEmitter,
    Input, OnChanges, Output, signal, SimpleChanges
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { emojisArray } from '@core/data';
import { ICategoryGroup } from '@core/interfaces';

@Component({
    selector: 'app-category-manager',
    standalone: true,
    imports: [FormsModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <!-- Backdrop -->
        <div class="backdrop" (click)="onClose()"></div>

        <!-- Modal Panel -->
        <div class="panel">
            <header class="panel__header">
                <h3>{{ editGroup ? 'Edit Category' : 'New Category' }}</h3>
                <button class="panel__close" (click)="onClose()">
                    <span class="material-icons-round">close</span>
                </button>
            </header>

            <div class="panel__body">
                <!-- Emoji Picker -->
                <div class="emoji-section">
                    <button class="emoji-trigger"
                            [class.has-value]="selectedEmoji()"
                            (click)="emojiPickerOpen.set(!emojiPickerOpen())">
                        @if (selectedEmoji()) {
                            <span class="emoji-trigger__value">{{ selectedEmoji() }}</span>
                        } @else {
                            <span class="material-icons-round">add_reaction</span>
                        }
                    </button>
                    <span class="emoji-label">Emoji</span>
                </div>

                @if (emojiPickerOpen()) {
                    <div class="emoji-grid-wrap">
                        <input class="emoji-search"
                               placeholder="Search emoji…"
                               (input)="onEmojiSearch($event)" />
                        <div class="emoji-grid">
                            @for (emoji of filteredEmojis(); track emoji) {
                                <button class="emoji-cell"
                                        [class.selected]="emoji === selectedEmoji()"
                                        (click)="selectEmoji(emoji)">
                                    {{ emoji }}
                                </button>
                            }
                        </div>
                    </div>
                }

                <!-- Title -->
                <label class="field">
                    <span class="field__label">Category name</span>
                    <input class="field__input"
                           type="text"
                           placeholder="e.g. Transport, Food…"
                           [ngModel]="titleValue()"
                           (ngModelChange)="titleValue.set($event)" />
                </label>

                <!-- Keys (chips + autocomplete) -->
                <div class="field">
                    <span class="field__label">Matching keys</span>
                    <div class="chips-wrap">
                        @for (key of keys(); track key) {
                            <span class="chip">
                                {{ key }}
                                <button class="chip__remove" (click)="removeKey(key)">
                                    <span class="material-icons-round">close</span>
                                </button>
                            </span>
                        }
                        <input class="chips-input"
                               placeholder="Type to add key…"
                               [ngModel]="keyInput()"
                               (ngModelChange)="onKeyInputChange($event)"
                               (keydown.enter)="addKeyFromInput()"
                               (keydown.tab)="addKeyFromInput(); $event.preventDefault()" />
                    </div>
                    @if (keyInput() && filteredSuggestions().length) {
                        <div class="suggestions">
                            @for (s of filteredSuggestions(); track s) {
                                <button class="suggestions__item" (click)="addKey(s)">
                                    {{ s }}
                                </button>
                            }
                        </div>
                    }
                    <span class="field__hint">
                        Press Enter or Tab to add. Text keys match descriptions; numeric keys (e.g. 5411) match MCC codes.
                    </span>
                </div>
            </div>

            <footer class="panel__footer">
                @if (editGroup) {
                    <button class="btn btn--danger" (click)="onDelete()">
                        <span class="material-icons-round">delete</span>
                        Delete
                    </button>
                }
                <div class="panel__footer-spacer"></div>
                <button class="btn btn--ghost" (click)="onClose()">Cancel</button>
                <button class="btn btn--primary"
                        [disabled]="!canSave()"
                        (click)="onSave()">
                    {{ editGroup ? 'Update' : 'Create' }}
                </button>
            </footer>
        </div>
    `,
    styles: [`
        :host {
            position: fixed;
            inset: 0;
            z-index: var(--z-modal);
            display: flex;
            align-items: center;
            justify-content: center;
            animation: fade-in var(--duration-fast) ease;
        }

        .backdrop {
            position: absolute;
            inset: 0;
            background: rgba(0,0,0,0.5);
            backdrop-filter: blur(4px);
        }

        .panel {
            position: relative;
            width: 480px;
            max-width: calc(100vw - 32px);
            max-height: calc(100vh - 64px);
            background: var(--color-surface);
            border: 1px solid var(--color-border);
            border-radius: var(--radius-lg);
            box-shadow: var(--shadow-4);
            display: flex;
            flex-direction: column;
            overflow: hidden;
            animation: slide-up var(--duration-normal) var(--ease-default);
        }

        .panel__header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: var(--space-5);
            border-bottom: 1px solid var(--color-border);

            h3 {
                font-size: var(--text-lg);
                font-weight: 600;
                color: var(--color-text-primary);
            }
        }

        .panel__close {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 32px;
            border-radius: var(--radius-sm);
            color: var(--color-text-tertiary);
            cursor: pointer;
            transition: all var(--duration-fast);
            &:hover { background: var(--color-surface-hover); color: var(--color-text-primary); }
        }

        .panel__body {
            padding: var(--space-5);
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: var(--space-4);
        }

        .panel__footer {
            display: flex;
            align-items: center;
            gap: var(--space-2);
            padding: var(--space-4) var(--space-5);
            border-top: 1px solid var(--color-border);
        }

        .panel__footer-spacer { flex: 1; }

        /* Emoji */
        .emoji-section {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: var(--space-2);
        }

        .emoji-trigger {
            width: 72px;
            height: 72px;
            border: 2px dashed var(--color-border-strong);
            border-radius: var(--radius-md);
            background: var(--color-surface-hover);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 32px;
            transition: all var(--duration-fast);
            color: var(--color-text-tertiary);

            &:hover, &.has-value {
                border-color: var(--color-primary);
                border-style: solid;
                background: var(--color-primary-subtle);
            }

            .material-icons-round { font-size: 28px; }
        }

        .emoji-trigger__value {
            font-family: var(--font-family-emoji);
        }

        .emoji-label {
            font-size: var(--text-xs);
            color: var(--color-text-tertiary);
        }

        .emoji-grid-wrap {
            border: 1px solid var(--color-border);
            border-radius: var(--radius-sm);
            overflow: hidden;
        }

        .emoji-search {
            width: 100%;
            padding: var(--space-2) var(--space-3);
            border: none;
            border-bottom: 1px solid var(--color-border);
            background: var(--color-surface);
            font-size: var(--text-sm);
            color: var(--color-text-primary);
            outline: none;
            &::placeholder { color: var(--color-text-tertiary); }
        }

        .emoji-grid {
            display: flex;
            flex-wrap: wrap;
            max-height: 200px;
            overflow-y: auto;
            padding: var(--space-2);
            gap: 2px;
        }

        .emoji-cell {
            width: 36px;
            height: 36px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
            font-family: var(--font-family-emoji);
            border-radius: var(--radius-sm);
            cursor: pointer;
            transition: background var(--duration-fast);

            &:hover { background: var(--color-surface-hover); }
            &.selected { background: var(--color-primary-subtle); }
        }

        /* Fields */
        .field {
            display: flex;
            flex-direction: column;
            gap: var(--space-1);
        }

        .field__label {
            font-size: var(--text-sm);
            font-weight: 500;
            color: var(--color-text-secondary);
        }

        .field__input {
            padding: var(--space-2) var(--space-3);
            border: 1px solid var(--color-border);
            border-radius: var(--radius-sm);
            background: var(--color-background);
            font-size: var(--text-sm);
            color: var(--color-text-primary);
            outline: none;
            transition: border-color var(--duration-fast);
            &:focus { border-color: var(--color-primary); }
            &::placeholder { color: var(--color-text-tertiary); }
        }

        .field__hint {
            font-size: var(--text-xs);
            color: var(--color-text-tertiary);
        }

        /* Chips */
        .chips-wrap {
            display: flex;
            flex-wrap: wrap;
            gap: var(--space-1);
            padding: var(--space-2) var(--space-3);
            border: 1px solid var(--color-border);
            border-radius: var(--radius-sm);
            background: var(--color-background);
            min-height: 40px;
            cursor: text;
            transition: border-color var(--duration-fast);
            &:focus-within { border-color: var(--color-primary); }
        }

        .chip {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 2px 8px;
            background: var(--color-primary-subtle);
            color: var(--color-primary);
            border-radius: var(--radius-full);
            font-size: var(--text-xs);
            font-weight: 500;
        }

        .chip__remove {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 16px;
            height: 16px;
            border-radius: 50%;
            cursor: pointer;
            color: var(--color-primary);
            transition: all var(--duration-fast);
            .material-icons-round { font-size: 12px; }
            &:hover { background: var(--color-primary); color: #fff; }
        }

        .chips-input {
            flex: 1;
            min-width: 120px;
            border: none;
            background: transparent;
            font-size: var(--text-sm);
            color: var(--color-text-primary);
            outline: none;
            &::placeholder { color: var(--color-text-tertiary); }
        }

        /* Suggestions */
        .suggestions {
            max-height: 180px;
            overflow-y: auto;
            border: 1px solid var(--color-border);
            border-radius: var(--radius-sm);
            background: var(--color-surface);
            box-shadow: var(--shadow-2);
        }

        .suggestions__item {
            display: block;
            width: 100%;
            text-align: left;
            padding: var(--space-2) var(--space-3);
            font-size: var(--text-sm);
            color: var(--color-text-primary);
            cursor: pointer;
            transition: background var(--duration-fast);
            &:hover { background: var(--color-surface-hover); }
        }

        /* Buttons */
        .btn {
            display: inline-flex;
            align-items: center;
            gap: var(--space-2);
            padding: var(--space-2) var(--space-4);
            border-radius: var(--radius-sm);
            font-size: var(--text-sm);
            font-weight: 500;
            cursor: pointer;
            transition: all var(--duration-fast);
            .material-icons-round { font-size: 16px; }
        }

        .btn--primary {
            background: var(--color-primary);
            color: #fff;
            &:hover:not(:disabled) { background: var(--color-primary-hover); }
            &:disabled { opacity: 0.5; cursor: not-allowed; }
        }

        .btn--ghost {
            background: transparent;
            color: var(--color-text-secondary);
            &:hover { background: var(--color-surface-hover); color: var(--color-text-primary); }
        }

        .btn--danger {
            background: transparent;
            color: var(--color-error);
            &:hover { background: var(--color-error-subtle); }
        }

        @keyframes fade-in {
            from { opacity: 0; }
            to   { opacity: 1; }
        }

        @keyframes slide-up {
            from { transform: translateY(24px); opacity: 0; }
            to   { transform: translateY(0);    opacity: 1; }
        }

        @media (max-width: 767px) {
            .panel {
                width: 100%;
                max-width: 100%;
                height: 100%;
                max-height: 100%;
                border-radius: 0;
            }
        }
    `],
})
export class CategoryManagerComponent implements OnChanges {
    @Input() editGroup: ICategoryGroup | null = null;
    @Input() transactionDescriptions: string[] = [];

    @Output() save = new EventEmitter<ICategoryGroup>();
    @Output() delete = new EventEmitter<ICategoryGroup>();
    @Output() close = new EventEmitter<void>();

    readonly selectedEmoji = signal('');
    readonly titleValue = signal('');
    readonly keys = signal<string[]>([]);
    readonly keyInput = signal('');
    readonly emojiPickerOpen = signal(false);
    readonly emojiSearch = signal('');

    readonly allEmojis = emojisArray;

    readonly filteredEmojis = signal<string[]>(emojisArray);
    readonly filteredSuggestions = signal<string[]>([]);

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['editGroup']) {
            if (this.editGroup) {
                this.selectedEmoji.set(this.editGroup.emoji);
                this.titleValue.set(this.editGroup.title);
                this.keys.set([...this.editGroup.keys]);
            } else {
                this.selectedEmoji.set('');
                this.titleValue.set('');
                this.keys.set([]);
            }
            this.keyInput.set('');
            this.emojiPickerOpen.set(false);
        }
    }

    canSave(): boolean {
        return !!this.selectedEmoji() && !!this.titleValue().trim() && this.keys().length > 0;
    }

    selectEmoji(emoji: string): void {
        this.selectedEmoji.set(emoji);
        this.emojiPickerOpen.set(false);
    }

    onEmojiSearch(event: Event): void {
        const q = (event.target as HTMLInputElement).value.toLowerCase();
        this.emojiSearch.set(q);
        if (!q) {
            this.filteredEmojis.set(this.allEmojis);
        } else {
            // Simple filter - just show all when searching since emoji names aren't stored
            this.filteredEmojis.set(this.allEmojis.filter(e => e.includes(q)));
        }
    }

    onKeyInputChange(value: string): void {
        this.keyInput.set(value);
        if (value.trim()) {
            const lower = value.toLowerCase();
            const currentKeys = this.keys();
            this.filteredSuggestions.set(
                this.transactionDescriptions
                    .filter(d => d.toLowerCase().includes(lower) && !currentKeys.includes(d))
                    .slice(0, 8)
            );
        } else {
            this.filteredSuggestions.set([]);
        }
    }

    addKey(key: string): void {
        const current = this.keys();
        if (!current.includes(key)) {
            this.keys.set([...current, key]);
        }
        this.keyInput.set('');
        this.filteredSuggestions.set([]);
    }

    addKeyFromInput(): void {
        const value = this.keyInput().trim();
        if (value) {
            this.addKey(value);
        }
    }

    removeKey(key: string): void {
        this.keys.update(k => k.filter(item => item !== key));
    }

    onSave(): void {
        if (!this.canSave()) return;
        this.save.emit({
            emoji: this.selectedEmoji(),
            title: this.titleValue().trim(),
            keys: this.keys(),
            amount: this.editGroup?.amount ?? 0,
        });
    }

    onDelete(): void {
        if (this.editGroup) {
            this.delete.emit(this.editGroup);
        }
    }

    onClose(): void {
        this.close.emit();
    }
}
