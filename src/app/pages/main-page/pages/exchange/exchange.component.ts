import { ChangeDetectionStrategy, ChangeDetectorRef, Component } from '@angular/core';
import { IAccountInfo, ICurrency } from '@core/interfaces';
import { MonobankService } from '@core/services';
import { take } from 'rxjs';

@Component({
    selector: 'app-exchange',
    templateUrl: './exchange.component.html',
    styleUrl: './exchange.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExchangeComponent {
    data: ICurrency[];
    data2: IAccountInfo;
    constructor(public monobankService: MonobankService, private cdr: ChangeDetectorRef) {
        this.monobankService
            .getActualCurrency()
            .pipe(take(1))
            .subscribe((res) => {
                this.data = res;
                this.cdr.detectChanges();
            });

        this.monobankService
            .getClientInfo()
            .pipe(take(1))
            .subscribe((res) => {
                this.data2 = res;
                this.cdr.detectChanges();
            });
    }
}
