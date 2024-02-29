import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { currencyCodesMap } from '@core/data';
import { IAccountInfo, ICurrency } from '@core/interfaces';
import { MonobankService } from '@core/services';
import { take } from 'rxjs';

@Component({
    selector: 'app-exchange',
    templateUrl: './exchange.component.html',
    styleUrl: './exchange.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExchangeComponent implements OnInit {
    public accountInfo: IAccountInfo;
    public currencyExchangeData: ICurrency[];
    public сurrencyCodesMap: {
        [key: number]: { name: string; flag: string };
    } = currencyCodesMap;

    constructor(
        private readonly monobankService: MonobankService,
        private readonly cdr: ChangeDetectorRef
    ) {}

    public ngOnInit(): void {
        this.getCurrencyExchangeData();
    }

    private getCurrencyExchangeData(): void {
        this.monobankService
            .getActualCurrency()
            .pipe(take(1))
            .subscribe((currency) => {
                this.currencyExchangeData = currency;
                this.adjustNecessaryCurrencyExchange();
                this.cdr.markForCheck();
            });
    }

    private adjustNecessaryCurrencyExchange(): void {
        this.currencyExchangeData = this.currencyExchangeData
            .filter((exchange) => this.сurrencyCodesMap[exchange.currencyCodeA])
            .map((exchange) => ({
                ...exchange,
                currencyNameA: this.сurrencyCodesMap[exchange.currencyCodeA].name,
                currencyNameB: this.сurrencyCodesMap[exchange.currencyCodeB].name,
                flagA: this.сurrencyCodesMap[exchange.currencyCodeA].flag,
                flagB: this.сurrencyCodesMap[exchange.currencyCodeB].flag,
            }));
    }
}
