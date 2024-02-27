import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { ChartType, TransactionSortBy } from '@core/enums';
import { IAccount, IAccountInfo, ICategoryGroup, ITransaction } from '@core/interfaces';
import { CategoryGroupService, MonobankService } from '@core/services';
import { Observable, Subject, delay, first, takeUntil } from 'rxjs';

@Component({
    selector: 'app-dashboard',
    templateUrl: './dashboard.component.html',
    styleUrl: './dashboard.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent implements OnInit {
    public groups$: Observable<ICategoryGroup[]>;
    public clientInfo$: Observable<IAccountInfo>;
    public transactions$: Observable<ITransaction[]>;
    public activeCardId$: Observable<string>;
    public transactions: ITransaction[] = [];
    public searchTransactionsValue: string = '';
    public sortTransactionsBy: TransactionSortBy = TransactionSortBy.Date;
    public sortDirection: 'asc' | 'desc' = 'asc';

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
        this.initTransactionsDataObserver();
        this.initTransactionsUpdatesObserver();
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

    private initTransactionsUpdatesObserver(): void {
        this.monobankService.transactionsUpdated$
            .pipe(takeUntil(this.destroy$))
            .subscribe(this.initTransactionsDataObserver.bind(this));
    }

    public onCardClick(account: IAccount): void {
        this.monobankService.setActiveCardId(account.id);
    }

    private initAccountInfoData(): void {
        this.clientInfo$ = this.monobankService
            .getClientInfo()
            .pipe(delay(2000));
    }

    private initCategoryGroupsData(): void {
        this.groups$ = this.categoryGroupService.categoryGroups$;
    }

    private initTransactionsDataObserver(): void {
        const firstMonthDay = this.getFirstMonthDay(new Date());

        this.monobankService
            .getTransactions(firstMonthDay, Date.now())
            .pipe(first())
            .subscribe((transactions) => {
                this.transactions = transactions;
                this.cdr.markForCheck();
            });
    }

    private initActiveCardId(): void {
        this.activeCardId$ = this.monobankService.activeCardId$;
    }

    private getFirstMonthDay(date: Date): number {
        return new Date(date.setDate(1)).setUTCHours(0, 0, 0, 0);
    }
}
