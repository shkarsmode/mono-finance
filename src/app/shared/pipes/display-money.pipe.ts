import { Pipe, PipeTransform } from '@angular/core';
import { CurrencyDisplayService } from '@core/services';

@Pipe({
    name: 'displayMoney',
    standalone: true,
    pure: false,
})
export class DisplayMoneyPipe implements PipeTransform {
    constructor(private readonly currencyDisplay: CurrencyDisplayService) {}

    transform(
        value: number | null | undefined,
        sourceCurrencyCode: number | string = 980,
        minimumFractionDigits = 2,
        maximumFractionDigits = 2,
    ): string {
        return this.currencyDisplay.formatMinorAmount(
            value,
            sourceCurrencyCode,
            minimumFractionDigits,
            maximumFractionDigits,
        );
    }
}
