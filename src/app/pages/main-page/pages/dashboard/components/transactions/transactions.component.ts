import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, inject, Input, OnInit, Output, ViewChild } from '@angular/core';
import { MatBadgeModule } from '@angular/material/badge';
import { MatCheckboxChange, MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TransactionSortBy } from '@core/enums';
import { ICategoryGroup, ITransaction } from '@core/interfaces';

@Component({
    selector: 'app-transactions',
    standalone: true,
    imports: [
        DatePipe, DecimalPipe,
        MatCheckboxModule, MatSelectModule, MatTooltipModule,
        MatBadgeModule, MatFormFieldModule,
    ],
    templateUrl: './transactions.component.html',
    styleUrl: './transactions.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransactionsComponent implements OnInit {
    @Input() public searchValue: string = '';
    @Input() public groups: ICategoryGroup[] | null = null;
    @Input() public transactions: ITransaction[] | null = null;
    @Input() public sortByValue!: TransactionSortBy;

    @Output() public sortBy = new EventEmitter<{ sortBy: TransactionSortBy; direction: 'asc' | 'desc' }>();
    @Output() public searchTransactions = new EventEmitter<string>();
    @Output() public selectValueChange = new EventEmitter<string[]>();
    @Output() public selectMonth = new EventEmitter<number>();
    @Output() public selectYear = new EventEmitter<number>();

    @ViewChild('inputRef') public inputRef!: ElementRef<HTMLInputElement>;

    public isFilterByGroups = false;
    public isAscSortDirection = false;
    public readonly SortBy = TransactionSortBy;
    public activeMonth = new Date().getMonth() + 1;
    public currentMonth = new Date().getMonth() + 1;
    public activeYear = new Date().getFullYear();
    public currentYear = new Date().getFullYear();
    public yearsMap: number[] = [];
    public isSmallScreen = window.innerWidth < 700;

    private readonly cdr = inject(ChangeDetectorRef);

    public readonly monthsMap = [
        { name: 'Jan', value: 1 }, { name: 'Feb', value: 2 },
        { name: 'Mar', value: 3 }, { name: 'Apr', value: 4 },
        { name: 'May', value: 5 }, { name: 'Jun', value: 6 },
        { name: 'Jul', value: 7 }, { name: 'Aug', value: 8 },
        { name: 'Sep', value: 9 }, { name: 'Oct', value: 10 },
        { name: 'Nov', value: 11 }, { name: 'Dec', value: 12 },
    ];

    ngOnInit(): void {
        const numberOfYears = new Date().getFullYear() - 2017;
        for (let i = 0; i <= numberOfYears; i++) {
            this.yearsMap.push(2017 + (numberOfYears - i));
        }
    }

    onInputEvent(event: Event): void {
        this.searchTransactions.emit((event.target as HTMLInputElement).value);
    }

    onSelectMonth(month: number): void {
        if ((this.currentMonth < month && this.currentYear === this.activeYear) || this.activeMonth === month) return;
        this.activeMonth = month;
        this.selectMonth.emit(month);
        this.cdr.detectChanges();
    }

    onSelectYear(year: number): void {
        if (this.activeYear === year) return;
        this.activeYear = year;
        if (this.currentYear === new Date().getFullYear()) {
            this.activeMonth = this.currentMonth;
            this.selectMonth.emit(this.activeMonth);
        }
        this.selectYear.emit(year);
    }

    clearInputEvent(): void {
        this.inputRef.nativeElement.value = '';
        this.searchTransactions.emit('');
    }

    onSortByEvent(sortBy: TransactionSortBy): void {
        if (sortBy === this.sortByValue) this.isAscSortDirection = !this.isAscSortDirection;
        this.sortBy.emit({ sortBy, direction: this.isAscSortDirection ? 'asc' : 'desc' });
    }

    onFilterGroupsChange(event: MatCheckboxChange): void {
        this.isFilterByGroups = event.checked;
        this.inputRef.nativeElement.value = '';
        this.selectValueChange.emit([]);
    }

    onSelectValueChange(event: string[]): void {
        this.selectValueChange.emit(event);
    }
}
