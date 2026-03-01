import { AsyncPipe, DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit, signal, ViewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ChartType, TransactionSortBy } from '@core/enums';
import { IAccount, IAccountInfo, ICategoryGroup, ITransaction } from '@core/interfaces';
import { CategoryGroupService, MonobankService } from '@core/services';
import { first, lastValueFrom, Observable, Subject } from 'rxjs';
import { TransactionsFilterPipe } from '../../../../shared/pipes/transactions-filter.pipe';
import { TransactionsSortByPipe } from '../../../../shared/pipes/transactions-sort-by.pipe';
import { CardComponent, ChartComponent, TransactionsComponent } from './components';

@Component({
    selector: 'app-dashboard',
    standalone: true,
    imports: [
        AsyncPipe, DatePipe, DecimalPipe,
        CardComponent, ChartComponent, TransactionsComponent,
        TransactionsFilterPipe, TransactionsSortByPipe,
    ],
    templateUrl: './dashboard.component.html',
    styleUrl: './dashboard.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class DashboardComponent implements OnInit {
    private readonly monobankService = inject(MonobankService);
    private readonly categoryGroupService = inject(CategoryGroupService);
    private readonly destroyRef = inject(DestroyRef);

    readonly transactions = signal<ITransaction[]>([]);
    readonly searchValue = signal('');
    readonly sortDirection = signal<'asc' | 'desc'>('desc');
    readonly sortBy = signal<TransactionSortBy>(TransactionSortBy.Date);
    readonly isBulkLoading = signal(false);
    readonly processedMonths = signal(0);
    readonly emptyStreak = signal(0);
    readonly rateLimitLeftSec = signal(0);
    readonly maxEmptyStreak = 2;

    activeCardId$!: Observable<string>;
    clientInfo$!: Observable<IAccountInfo>;
    groups$!: Observable<ICategoryGroup[]>;
    transactions$!: Observable<ITransaction[]>;
    readonly ChartType = ChartType;

    private cancelBulkRequested = false;
    private readonly cancelPreviousRequest$ = new Subject<void>();

    @ViewChild('transactionsRef') transactionsRef!: TransactionsComponent;

    ngOnInit(): void {
        this.activeCardId$ = this.monobankService.activeCardId$;
        this.clientInfo$ = this.monobankService.clientInfo$;
        this.groups$ = this.categoryGroupService.categoryGroups$;
        this.transactions$ = this.monobankService.currentTransactions$;

        this.transactions$
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(t => this.transactions.set(t));

        this.monobankService.rateLimitCooldown$
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(sec => this.rateLimitLeftSec.set(sec));
    }

    onCardClick(account: IAccount): void {
        this.monobankService.setActiveCardId(account.id);
    }

    onSelectMonth(month: number): void {
        this.monobankService.activeMonth = month;
        this.cancelPreviousRequest$.next();
        this.monobankService
            .getTransactions(month, this.monobankService.activeYear)
            .pipe(first(), takeUntilDestroyed(this.destroyRef))
            .subscribe();
    }

    onSelectYear(year: number): void {
        this.monobankService.activeYear = year;
        this.cancelPreviousRequest$.next();
        this.monobankService
            .getTransactions(this.monobankService.activeMonth, year)
            .pipe(first(), takeUntilDestroyed(this.destroyRef))
            .subscribe();
    }

    onSearchTransaction(value: string): void {
        this.searchValue.set(value);
    }

    onSelectValueChange(value: string[]): void {
        this.searchValue.set(value.join());
    }

    onSortTransactionsBy(sort: { sortBy: TransactionSortBy; direction: 'asc' | 'desc' }): void {
        this.sortBy.set(sort.sortBy);
        this.sortDirection.set(sort.direction);
    }

    get bulkProgressPercent(): number {
        return Math.max(0, Math.min(100, Math.round(this.processedMonths() / 24 * 100)));
    }

    async onLoadAllClick(): Promise<void> {
        if (this.isBulkLoading() || this.rateLimitLeftSec() > 0) return;

        this.isBulkLoading.set(true);
        this.cancelBulkRequested = false;
        this.processedMonths.set(0);
        this.emptyStreak.set(0);

        try {
            let y = this.monobankService.activeYear;
            let m = this.monobankService.activeMonth;

            while (
                !this.cancelBulkRequested &&
                this.emptyStreak() < this.maxEmptyStreak &&
                this.processedMonths() < 240 &&
                y >= 2015
            ) {
                const trs = await lastValueFrom(
                    this.monobankService.getTransactions(m, y).pipe(first())
                );

                if ((trs as any)['status'] === 429) {
                    await new Promise(r => setTimeout(r, 60001));
                    continue;
                }

                if ((trs as any)['data']?.length) {
                    this.emptyStreak.set(0);
                    this.monobankService.mergeTransactions(trs as any);
                } else {
                    this.emptyStreak.update(v => v + 1);
                }

                this.processedMonths.update(v => v + 1);
                if (m > 1) { m--; } else { m = 12; y--; }

                if (this.transactionsRef) {
                    this.transactionsRef.activeMonth = m;
                    this.transactionsRef.activeYear = y;
                }
                this.monobankService.activeMonth = m;
                this.monobankService.activeYear = y;
            }
        } catch (err) {
            console.error('Bulk load failed:', err);
        } finally {
            this.isBulkLoading.set(false);
        }
    }

    onCancelLoadAll(): void {
        this.cancelBulkRequested = true;
    }
}