import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { currencyCodesMap } from '@core/data';
import { ICurrency } from '@core/interfaces';
import { MonobankService } from '@core/services';
import { take } from 'rxjs';
import { CurrencyExchangeComponent } from './components/currency-exchange/currency-exchange.component';

@Component({
    selector: 'app-exchange',
    standalone: true,
    imports: [CurrencyExchangeComponent],
    templateUrl: './exchange.component.html',
    styleUrl: './exchange.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class ExchangeComponent implements OnInit {
    private readonly monobankService = inject(MonobankService);

    readonly currencyData = signal<ICurrency[]>([]);
    readonly isLoading = signal(true);
    private readonly codesMap = currencyCodesMap;

    ngOnInit(): void {
        this.monobankService.getActualCurrency().pipe(take(1)).subscribe(data => {
            const filtered = data
                .filter(e => this.codesMap[e.currencyCodeA])
                .map(e => ({
                    ...e,
                    currencyNameA: this.codesMap[e.currencyCodeA].name,
                    currencyNameB: this.codesMap[e.currencyCodeB]?.name ?? 'UAH',
                    flagA: this.codesMap[e.currencyCodeA].flag,
                    flagB: this.codesMap[e.currencyCodeB]?.flag ?? 'ua',
                }));
            this.currencyData.set(filtered);
            this.isLoading.set(false);
        });
    }
}
