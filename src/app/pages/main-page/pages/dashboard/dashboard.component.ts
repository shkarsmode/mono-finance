import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { ChartType } from '@core/enums';
import { ICategoryGroup, ITransactions } from '@core/interfaces';
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
    public transactions$: Observable<ITransactions[]>;
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
            Date.now(),
            '3cWauWKmk1zKlct5eedYRA'
        );
    }

    private getFirstMonthDay(date: Date): number {
        return new Date(date.setDate(1)).setUTCHours(0, 0, 0, 0);
    }
}
