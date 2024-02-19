import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { ChartType } from '@core/enums';
import { ICategoryGroup, ITransaction } from '@core/interfaces';
import { CategoryGroupService, MonobankService } from '@core/services';
import { Observable } from 'rxjs';

@Component({
    selector: 'app-dashboard',
    templateUrl: './dashboard.component.html',
    styleUrl: './dashboard.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent implements OnInit {
    public groups$: Observable<ICategoryGroup[]>;
    public transactions$: Observable<ITransaction[]>;
    public readonly ChartType: typeof ChartType = ChartType;

    constructor(
        private readonly monobankService: MonobankService,
        private readonly categoryGroupService: CategoryGroupService
    ) {}

    public ngOnInit(): void {
        this.initTransactionsData();
        this.initCategoryGroupsData();
    }

    public initCategoryGroupsData(): void {
        this.groups$ = this.categoryGroupService.get();
    }

    private initTransactionsData(): void {
        const firstMonthDay = this.getFirstMonthDay(new Date());

        this.transactions$ = this.monobankService.getTransactions(
            firstMonthDay,
            Date.now()
        );
    }

    private getFirstMonthDay(date: Date): number {
        return new Date(date.setDate(1)).setUTCHours(0, 0, 0, 0);
    }
}
