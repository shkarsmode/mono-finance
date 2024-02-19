import { LiveAnnouncer } from '@angular/cdk/a11y';
import { ENTER } from '@angular/cdk/keycodes';
import { Component, ElementRef, Inject, ViewChild, inject } from '@angular/core';
import { FormControl } from '@angular/forms';
import { MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatChipInputEvent } from '@angular/material/chips';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSelect } from '@angular/material/select';
import { Observable, map, startWith } from 'rxjs';

@Component({
    selector: 'app-dialog-add-category',
    templateUrl: './dialog-add-category.component.html',
    styleUrl: './dialog-add-category.component.scss',
})
export class DialogAddCategoryComponent {
    public keys: string[] = [];
    public allKeys: string[] = [];
    public keysCtrl = new FormControl('');
    public emojis: string[] = emojisArray;
    public filteredKeys: Observable<string[]>;
    public separatorKeysCodes: number[] = [ENTER];

    @ViewChild('emojiRef') emojiSelect: MatSelect;
    @ViewChild('titleRef') titleRef: ElementRef<HTMLInputElement>;
    @ViewChild('keysInput') keysInput: ElementRef<HTMLInputElement>;

    announcer = inject(LiveAnnouncer);

    constructor(
        @Inject(MAT_DIALOG_DATA) public data: { transactions: string[] },
        private readonly dialog: MatDialogRef<void>
    ) {
        this.filteredKeys = this.keysCtrl.valueChanges.pipe(
            startWith(null),
            map((fruit: string | null) =>
                fruit ? this.filter(fruit) : this.allKeys.slice()
            )
        );

        this.allKeys = data.transactions;
    }

    public add(event: MatChipInputEvent): void {
        const value = (event.value || '').trim();

        if (value) {
            this.keys.push(value);
        }

        event.chipInput!.clear();

        this.keysCtrl.setValue(null);
    }

    public remove(fruit: string): void {
        const index = this.keys.indexOf(fruit);

        if (index >= 0) {
            this.keys.splice(index, 1);

            this.announcer.announce(`Removed ${fruit}`);
        }
    }

    public selected(event: MatAutocompleteSelectedEvent): void {
        this.keys.push(event.option.viewValue);
        this.keysInput.nativeElement.value = '';
        this.keysCtrl.setValue(null);
    }

    public create(): void {
        const data = {
            keys: this.keys,
            emoji: this.emojiSelect.value,
            title: this.titleRef.nativeElement.value,
            amount: 0
        };
        if (!data.keys.length || !data.emoji || !data.title) {
            return;
        }

        this.dialog.close(data);
    }

    private filter(value: string): string[] {
        const filterValue = value.toLowerCase();

        return this.allKeys.filter((key) =>
            key.toLowerCase().includes(filterValue)
        );
    }
}

const emojisArray = [
    '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😭', '😉',
    '😗', '😙', '😚', '😘', '🥰', '😍', '🤩', '🥳', '🙃', '🙂',
    '🥲', '🥹', '😋', '😛', '😝', '😜', '🤪', '😇', '😊', '☺️',
    '😏', '😌', '😔', '😑', '😐', '😶', '🫡', '🤔', '🤫', '🫢',
    '🤭', '🥱', '🤗', '🫣', '😱', '🤨', '🧐', '😒', '🙄', '😮‍💨',
    '😤', '😠', '😡', '🤬', '🥺', '😟', '😥', '😢', '☹️', '🙁',
    '🫤', '😕', '🤐', '😰', '😨', '😧', '😦', '😮', '😯', '😲',
    '😳', '🤯', '😬', '😓', '😞', '😖', '😣', '😩', '😫', '😵',
    '😵‍💫', '🫥', '😴', '😪', '🤤', '🌛', '🌜', '🌚', '🌝', '🌞',
    '🫠', '😶‍🌫️', '🥴', '🥵', '🥶', '🤢', '🤮', '🤧', '🤒', '🤕',
    '😷', '🤠', '🤑', '😎', '🤓', '🥸', '🤥', '🤡', '👻', '💩',
    '👽', '🤖', '🎃', '😈', '👿', '👹', '👺', '🔥', '💫', '⭐',
    '🌟', '✨', '💥', '💯', '💢', '💨', '💦', '🫧', '💤', '🕳️',
    '🎉', '🎊', '🙈', '🙉', '🙊', '😺', '😸', '😹', '😻', '😼',
    '😽', '🙀', '😿', '😾', '❤️', '🧡', '💛', '💚', '💙', '💜',
    '🤎', '🖤', '🤍', '♥️', '💘', '💝', '💖', '💗', '💓', '💞',
    '💕', '💌', '💟', '❣️', '❤️‍🩹', '💔', '❤️‍🔥', '💋', '🫂',
    '👥', '👤', '🗣️', '👣', '🧠', '🫀', '🫁', '🩸', '🦠', '🦷',
    '🦴', '☠️', '💀', '👀', '👁️', '👄', '🫦', '👅', '👃', '👂',
    '🦻', '🦶', '🦵', '🦿', '🦾', '💪', '👍', '👎', '👏', '🫶',
    '🙌', '👐', '🤲', '🤝', '🤜', '🤛', '✊', '👊', '🫳', '🫴',
    '🫱', '🫲', '🤚', '👋', '🖐️', '✋', '🖖', '🤟', '🤘', '✌️',
    '🤞', '🫰', '🤙', '🤌', '🤏', '👌', '🖕', '☝️', '👆', '👇',
    '👉', '👈', '🫵', '✍️', '🤳', '🙏', '💅'
];