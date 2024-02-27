import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { MatCheckboxChange } from '@angular/material/checkbox';
import { TransactionSortBy } from '@core/enums';
import { ICategoryGroup, ITransaction } from '@core/interfaces';

@Component({
    selector: 'app-transactions',
    templateUrl: './transactions.component.html',
    styleUrl: './transactions.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransactionsComponent {
    @Input() public searchValue: string = '';
    @Input() public groups: ICategoryGroup[] | null;
    @Input() public transactions: ITransaction[] | null;
    @Input() public sortByValue: TransactionSortBy;

    @Output() public sortBy: EventEmitter<
        { sortBy: TransactionSortBy, direction: 'asc' | 'desc'}
    > = new EventEmitter();
    @Output() public searchTransactions: EventEmitter<string> = new EventEmitter();
    @Output() public selectValueChange: EventEmitter<string[]> = new EventEmitter();

    @ViewChild('inputRef') public inputRef: ElementRef<HTMLInputElement>;

    public isFilterByGroups: boolean = false;
    public isAscSortDirection: boolean = true;
    public readonly SortBy: typeof TransactionSortBy = TransactionSortBy;

    public onInputEvent(event: Event): void {
        this.searchTransactions.emit((event.target as HTMLInputElement).value);
    }

    public clearInputEvent(): void {
        this.inputRef.nativeElement.value = '';
        this.searchTransactions.emit('');
    }

    public onSortByEvent(sortBy: TransactionSortBy): void {
        this.isAscSortDirection = !this.isAscSortDirection; 
        const direction = this.isAscSortDirection ? 'asc' : 'desc';
        this.sortBy.emit({ sortBy, direction });
    }

    public onFilterGroupsChange(event: MatCheckboxChange): void {
        this.isFilterByGroups = event.checked;
        this.inputRef.nativeElement.value = '';
        this.selectValueChange.emit([]);
    }

    public onSelectValueChange(event: string[]): void {
        console.log(event);
        this.selectValueChange.emit(event as string[]);
    }
}
