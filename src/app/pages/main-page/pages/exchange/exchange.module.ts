import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';

import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { AngularSvgIconModule } from 'angular-svg-icon';
import { CurrencyExchangeInputBlockComponent } from './components/currency-exchange/currency-exchange-input-block/currency-exchange-input-block.component';
import { CurrencyExchangeComponent } from './components/currency-exchange/currency-exchange.component';
import { ExchangeComponent } from './exchange.component';
import { ExchangeRoutingModule } from './exchange.routing';

@NgModule({
    declarations: [ExchangeComponent, CurrencyExchangeComponent, CurrencyExchangeInputBlockComponent],
    imports: [
        CommonModule,
        ExchangeRoutingModule,
        AngularSvgIconModule,
        FormsModule,
        ReactiveFormsModule
    ]
})
export class ExchangeModule {}
