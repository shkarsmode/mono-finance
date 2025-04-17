import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { ChartType, TransactionSortBy } from '@core/enums';
import { IAccount, IAccountInfo, ICategoryGroup, ITransaction } from '@core/interfaces';
import { CategoryGroupService, MonobankService } from '@core/services';
import { Observable, Subject, first, takeUntil } from 'rxjs';

@Component({
    selector: 'app-dashboard',
    templateUrl: './dashboard.component.html',
    styleUrl: './dashboard.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent implements OnInit {
    public transactions: ITransaction[] = [];
    public searchTransactionsValue: string = '';
    public sortDirection: 'asc' | 'desc' = 'desc';

    public activeCardId$: Observable<string>;
    public clientInfo$: Observable<IAccountInfo>;
    public groups$: Observable<ICategoryGroup[]>;
    public transactions$: Observable<ITransaction[]>;
    public sortTransactionsBy: TransactionSortBy = TransactionSortBy.Date;

    public readonly ChartType: typeof ChartType = ChartType;
    private readonly destroy$: Subject<void> = new Subject();

    constructor(
        private readonly cdr: ChangeDetectorRef,
        private readonly monobankService: MonobankService,
        private readonly categoryGroupService: CategoryGroupService
    ) {}

    public ngOnInit(): void {
        this.initActiveCardId();
        this.initAccountInfoData();
        this.initCategoryGroupsData();
        this.initCurrentTransactionsObserver();
        // this.initTransactionsDataObserver();
        // this.initTransactionsUpdatesObserver();
    }

    public onSelectMonth(month: number): void {
        this.monobankService.activeMonth = month;
        this.monobankService
            .getTransactions(month, this.monobankService.activeYear)
            .pipe(first())
            .subscribe();
    }

    public onSelectYear(year: number): void {
        console.log(this.monobankService.activeYear, this.monobankService.activeMonth);
        this.monobankService.activeYear = year;
        this.monobankService
            .getTransactions(
                +this.monobankService.activeMonth,
                year
            )
            .pipe(first())
            .subscribe();
    }

    public onSearchTransaction(searchValue: string): void {
        this.searchTransactionsValue = searchValue;
    }

    public onSelectValueChange(value: string[]): void {
        this.searchTransactionsValue = value.join();
    }

    public onSortTransactionsBy(sort: {
        sortBy: TransactionSortBy;
        direction: 'asc' | 'desc';
    }): void {
        this.sortTransactionsBy = sort.sortBy;
        this.sortDirection = sort.direction;
    }

    private initCurrentTransactionsObserver(): void {
        this.transactions$ = this.monobankService.currentTransactions$;
        this.transactions$
            .pipe(takeUntil(this.destroy$))
            .subscribe((transactions) => (this.transactions = transactions));
    }

    public onCardClick(account: IAccount): void {
        this.monobankService.setActiveCardId(account.id);
    }

    private initAccountInfoData(): void {
        this.clientInfo$ = this.monobankService.clientInfo$;
    }

    private initCategoryGroupsData(): void {
        this.groups$ = this.categoryGroupService.categoryGroups$;
    }

    private initActiveCardId(): void {
        this.activeCardId$ = this.monobankService.activeCardId$;
    }
}