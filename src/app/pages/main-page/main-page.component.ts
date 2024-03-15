import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { LocalStorage } from '@core/enums';
import { MonobankService } from '@core/services';
import { first } from 'rxjs';

@Component({
    selector: 'app-main-page',
    templateUrl: './main-page.component.html',
    styleUrl: './main-page.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MainPageComponent implements OnInit {
    constructor(
        private readonly monobankService: MonobankService
    ) {}

    public ngOnInit(): void {
        this.initClientInfoData();
        this.initTransactionsData();
    }

    private initClientInfoData(): void {
        this.monobankService.getClientInfo().pipe(first()).subscribe();
    }

    private initTransactionsData(): void {
        if (localStorage.getItem(LocalStorage.MonobankActiveCardId)) {
            this.monobankService
                .getTransactions(this.monobankService.activeMonth)
                .pipe(first())
                .subscribe();
        }
    }
}
