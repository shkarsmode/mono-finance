import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { TransactionsFilterPipe } from './pipes/transactions-filter.pipe';

@NgModule({
    declarations: [TransactionsFilterPipe],
    imports: [CommonModule],
    exports: [TransactionsFilterPipe],
})
export class SharedModule {}
