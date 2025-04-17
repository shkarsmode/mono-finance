import { Component, ElementRef, EventEmitter, Input, OnInit, Output, ViewChild } from '@angular/core';
import { MatCheckboxChange } from '@angular/material/checkbox';
import { TransactionSortBy } from '@core/enums';
import { ICategoryGroup, ITransaction } from '@core/interfaces';

@Component({
    selector: 'app-transactions',
    templateUrl: './transactions.component.html',
    styleUrl: './transactions.component.scss',
    // changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransactionsComponent implements OnInit {
    @Input() public searchValue: string = '';
    @Input() public groups: ICategoryGroup[] | null;
    @Input() public transactions: ITransaction[] | null;
    @Input() public sortByValue: TransactionSortBy;

    @Output() public sortBy: EventEmitter<{
        sortBy: TransactionSortBy;
        direction: 'asc' | 'desc';
    }> = new EventEmitter();
    @Output() public searchTransactions: EventEmitter<string> =
        new EventEmitter();
    @Output() public selectValueChange: EventEmitter<string[]> =
        new EventEmitter();
    @Output() public selectMonth: EventEmitter<number> = new EventEmitter();
    @Output() public selectYear: EventEmitter<number> = new EventEmitter();

    @ViewChild('inputRef') public inputRef: ElementRef<HTMLInputElement>;

    public isFilterByGroups: boolean = false;
    public isAscSortDirection: boolean = false;
    public readonly SortBy: typeof TransactionSortBy = TransactionSortBy;
    public activeMonth: number = new Date().getMonth() + 1;
    public currentMonth: number = new Date().getMonth() + 1;
    public activeYear: number = new Date().getFullYear();
    public currentYear: number = new Date().getFullYear();
    public yearsMap: number[] = [];

    public readonly monthsMap = [
        { name: 'Jan', value: 1 },
        { name: 'Feb', value: 2 },
        { name: 'Mar', value: 3 },
        { name: 'Apr', value: 4 },
        { name: 'May', value: 5 },
        { name: 'Jun', value: 6 },
        { name: 'Jul', value: 7 },
        { name: 'Aug', value: 8 },
        { name: 'Sep', value: 9 },
        { name: 'Oct', value: 10 },
        { name: 'Nov', value: 11 },
        { name: 'Dec', value: 12 },
    ];

    public ngOnInit(): void {
        const numberOfYears = new Date().getFullYear() - 2017;
        for (let i = 0; i <= numberOfYears; i++) {
            this.yearsMap.push(2017 + i);
        }
    }

    public onInputEvent(event: Event): void {
        this.searchTransactions.emit((event.target as HTMLInputElement).value);
    }

    public onSelectMonth(month: number): void {
        if (
            (this.currentMonth < month &&
                this.currentYear === this.activeYear) ||
            this.activeMonth === month
        )
            return;

        this.activeMonth = month;
        this.selectMonth.emit(month);
    }

    public onSelectYear(year: number): void {
        if (this.activeYear === year) return;
        this.activeYear = year;

        if (this.currentYear === new Date().getFullYear()) {
            this.activeMonth = this.currentMonth;
            this.selectMonth.emit(this.activeMonth);
        }
        
        this.selectYear.emit(year);
    }

    public clearInputEvent(): void {
        this.inputRef.nativeElement.value = '';
        this.searchTransactions.emit('');
    }

    public onSortByEvent(sortBy: TransactionSortBy): void {
        if (sortBy === this.sortByValue)
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
