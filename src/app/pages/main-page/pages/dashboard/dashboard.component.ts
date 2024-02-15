import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { ITransactions } from '@core/interfaces';
import { MonobankService } from '@core/services';
import { Observable } from 'rxjs';

@Component({
    selector: 'app-dashboard',
    templateUrl: './dashboard.component.html',
    styleUrl: './dashboard.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent implements OnInit {
    public transactions$: Observable<ITransactions[]>;

    constructor(
        private readonly monobankService: MonobankService
    ) {}

    public ngOnInit(): void {
        this.initTransactionsData();
    }

    private initTransactionsData(): void {
        const firstMonthDay = new Date(new Date().setDate(1)).setUTCHours(0, 0, 0, 0);
        this.transactions$ = this.monobankService.getTransactions(
            firstMonthDay,
            Date.now(),
            '3cWauWKmk1zKlct5eedYRA'
        );
    }
}
