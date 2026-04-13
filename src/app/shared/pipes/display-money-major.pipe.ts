import { Pipe, PipeTransform } from '@angular/core';
import { CurrencyDisplayService } from '@core/services';

@Pipe({
    name: 'displayMoneyMajor',
    standalone: true,
    pure: false,
})
export class DisplayMoneyMajorPipe implements PipeTransform {
    constructor(private readonly currencyDisplay: CurrencyDisplayService) {}

    transform(
        value: number | null | undefined,
        sourceCurrencyCode: number | string = 980,
        minimumFractionDigits = 2,
        maximumFractionDigits = 2,
    ): string {
        return this.currencyDisplay.formatMajorAmount(
            value,
            sourceCurrencyCode,
            minimumFractionDigits,
            maximumFractionDigits,
        );
    }
}
