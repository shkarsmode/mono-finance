import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';

import { ExchangeComponent } from './exchange.component';
import { ExchangeRoutingModule } from './exchange.routing';

@NgModule({
    declarations: [ExchangeComponent],
    imports: [CommonModule, ExchangeRoutingModule],
})
export class ExchangeModule {}
