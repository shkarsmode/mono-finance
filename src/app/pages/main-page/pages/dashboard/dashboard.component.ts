import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, ViewChild } from '@angular/core';
import { ChartType, TransactionSortBy } from '@core/enums';
import { IAccount, IAccountInfo, ICategoryGroup, ITransaction } from '@core/interfaces';
import { CategoryGroupService, MonobankService } from '@core/services';
import { Observable, Subject, first, lastValueFrom, takeUntil } from 'rxjs';
import { TransactionsComponent } from './components';

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
    private readonly cancelPreviousRequest$: Subject<void> = new Subject();

    public isSyncingAll = false;
    public rateLimitLeftSec = 0;
    public processedMonths = 0;
    public emptyStreak = 0;
    public maxEmptyStreak = 2;  
    private cancelBulkRequested = false;

    public isBulkLoading = false;
    public retryAttempt = 0;
    public bulkProgress = { done: 0, total: 0 };
    private readonly cancelBulk$ = new Subject<void>();

    @ViewChild('transactionsRef') public transactionsRef: TransactionsComponent

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

        this.monobankService.rateLimitCooldown$
            .pipe(takeUntil(this.destroy$))
            .subscribe(sec => {
                if (sec > 0 && this.isBulkLoading) this.retryAttempt++; // грубая эвристика
                this.rateLimitLeftSec = sec;
                this.cdr.markForCheck();
            });
    }

    public delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    public async onLoadAllClick(): Promise<void> {
        if (this.isBulkLoading || this.rateLimitLeftSec > 0) return;

        this.isBulkLoading = true;
        this.cancelBulkRequested = false;
        this.processedMonths = 0;
        this.emptyStreak = 0;
        this.cdr.markForCheck();

        try {
            let y = this.monobankService.activeYear;
            let m = this.monobankService.activeMonth;

            const MAX_MONTHS = 240;
            const MIN_YEAR   = 2015; 

            while (
                !this.cancelBulkRequested &&
                this.emptyStreak < this.maxEmptyStreak &&
                this.processedMonths < MAX_MONTHS &&
                y >= MIN_YEAR
            ) {
                const trs = await lastValueFrom(
                    this.monobankService.getTransactions(m, y).pipe(first())
                );

                if (trs['status'] === 429) {
                    await this.delay(60001);
                    continue;
                }

                if (trs['data']?.length) {
                    this.emptyStreak = 0;
                    this.monobankService.mergeTransactions(trs);
                } else {
                    this.emptyStreak += 1;
                }

                this.processedMonths += 1;
                const prev = this.prevMonth(m, y);
                m = prev.m; y = prev.y;

                
                this.transactionsRef.activeMonth = m;
                this.transactionsRef.activeYear = y;
                
                this.monobankService.activeMonth = m;
                this.monobankService.activeYear = y;

                this.cdr.markForCheck();
            }
        } catch (err) {
            console.error('Bulk descending load failed:', err);
        } finally {
            this.isBulkLoading = false;
            this.cdr.markForCheck();
        }
    }

    private prevMonth(m: number, y: number): { m: number; y: number } {
        if (m > 1) return { m: m - 1, y };
        return { m: 12, y: y - 1 };
    }

    public get bulkProgressPercent(): number {
        return Math.max(0, Math.min(100, Math.round(this.processedMonths / 24 * 100)));
    }

    private buildMonthRange(fromYear: number): { m: number; y: number }[] {
        const now = new Date();
        const toYear = now.getFullYear();
        const toMonth = now.getMonth() + 1; // 1..12

        const out: { m: number; y: number }[] = [];
        for (let y = fromYear; y <= toYear; y++) {
            const startM = (y === fromYear) ? 1 : 1;
            const endM   = (y === toYear) ? toMonth : 12;
            for (let m = startM; m <= endM; m++) {
                out.push({ m, y });
            }
        }
        return out;
    }

    public onCancelLoadAll(): void {
        if (!this.isBulkLoading) return;
        this.cancelBulk$.next();
    }

    public onSelectMonth(month: number): void {
        this.monobankService.activeMonth = month;
        this.cancelPreviousRequest$.next();
        this.monobankService
            .getTransactions(month, this.monobankService.activeYear)
            .pipe(first(), takeUntil(this.cancelPreviousRequest$))
            .subscribe({
                next: (transactions) => {},
                error: (err) => {
                    console.error(err);
                },
            });
    }

    public onSelectYear(year: number): void {
        this.monobankService.activeYear = year;
        this.cancelPreviousRequest$.next();
        this.monobankService
            .getTransactions(this.monobankService.activeMonth, year)
            .pipe(first(), takeUntil(this.cancelPreviousRequest$))
            .subscribe({
                next: (transactions) => {},
                error: (err) => {
                    console.error(err);
                },
            });
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