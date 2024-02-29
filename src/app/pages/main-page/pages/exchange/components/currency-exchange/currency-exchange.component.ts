import {
    ChangeDetectionStrategy,
    Component,
    Input,
    OnInit
} from '@angular/core';
import { ICurrency } from '@core/interfaces';

@Component({
    selector: 'app-currency-exchange',
    templateUrl: './currency-exchange.component.html',
    styleUrl: './currency-exchange.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CurrencyExchangeComponent implements OnInit {
    @Input() public exchange: ICurrency;

    public sellValue: string = '1.00';
    public buyValue: string;

    constructor() {}

    public ngOnInit(): void {
        this.initFirstBuyValue();
    }

    private initFirstBuyValue(): void {
        this.onSellChangeRate();
    }

    public onBlurEvent(event: FocusEvent): void {
        (event.target as HTMLInputElement).value =
            (+(event.target as HTMLInputElement).value).toFixed(2);
    }

    public onSellChangeRate(): void {
        this.buyValue = this.getFormattedCurrencyValue(
            this.sellValue,
            this.exchange.rateSell || this.exchange.rateCross
        );
    }

    public onBuyChangeRate(): void {
        this.sellValue = this.getFormattedCurrencyValue(
            this.buyValue,
            this.exchange.rateSell || this.exchange.rateCross,
            false
        );
    }

    private getFormattedCurrencyValue(
        value: string,
        rate: string | number,
        isMultiple: boolean = true
    ): string {
        const result = isMultiple ? +value * +rate : +value / +rate;
        return result.toFixed(2);
    }
}
