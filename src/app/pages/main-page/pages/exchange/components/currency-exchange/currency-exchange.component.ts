import { ChangeDetectionStrategy, Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ICurrency } from '@core/interfaces';
import { CurrencyExchangeInputBlockComponent } from './currency-exchange-input-block/currency-exchange-input-block.component';

@Component({
    selector: 'app-currency-exchange',
    standalone: true,
    imports: [FormsModule, CurrencyExchangeInputBlockComponent],
    templateUrl: './currency-exchange.component.html',
    styleUrl: './currency-exchange.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CurrencyExchangeComponent implements OnInit {
    @Input({ required: true }) exchange!: ICurrency;

    sellValue = '1.00';
    buyValue = '';

    ngOnInit(): void {
        this.onSellChangeRate();
    }

    onBlurEvent(event: FocusEvent): void {
        const el = event.target as HTMLInputElement;
        el.value = (+el.value).toFixed(2);
    }

    onSellChangeRate(): void {
        this.buyValue = this.format(this.sellValue, this.rate, true);
    }

    onBuyChangeRate(): void {
        this.sellValue = this.format(this.buyValue, this.rate, false);
    }

    private get rate(): number {
        return +(this.exchange.rateSell || this.exchange.rateCross);
    }

    private format(value: string, rate: number, multiply: boolean): string {
        const result = multiply ? +value * rate : +value / rate;
        return result.toFixed(2);
    }
}
