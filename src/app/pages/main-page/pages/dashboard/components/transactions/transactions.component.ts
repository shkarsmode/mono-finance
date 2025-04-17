import { ChangeDetectorRef, Component, ElementRef, EventEmitter, inject, Input, OnInit, Output, ViewChild } from '@angular/core';
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
    public isAchievedLessThan700px: boolean = window.innerWidth < 700;

    private readonly cdr: ChangeDetectorRef = inject(ChangeDetectorRef);

    public readonly monthsMap = [
        { name: 'January', value: 1 },
        { name: 'February', value: 2 },
        { name: 'March', value: 3 },
        { name: 'April', value: 4 },
        { name: 'May', value: 5 },
        { name: 'June', value: 6 },
        { name: 'July', value: 7 },
        { name: 'August', value: 8 },
        { name: 'September', value: 9 },
        { name: 'October', value: 10 },
        { name: 'November', value: 11 },
        { name: 'December', value: 12 },
    ];

    public ngOnInit(): void {
        const numberOfYears = new Date().getFullYear() - 2017;
        for (let i = 0; i <= numberOfYears; i++) {
            this.yearsMap.push(2017 + (numberOfYears - i));
        }
    }

    public onInputEvent(event: Event): void {
        this.searchTransactions.emit((event.target as HTMLInputElement).value);
    }

    public onSelectMonth(month: number): void {
        console.log(month);
        if (
            (this.currentMonth < month &&
                this.currentYear === this.activeYear) ||
            this.activeMonth === month
        )
            return;

        this.activeMonth = month;
        this.selectMonth.emit(month);

        this.cdr.detectChanges();
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
