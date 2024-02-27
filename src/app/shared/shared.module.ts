import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { TransactionsFilterPipe } from './pipes/transactions-filter.pipe';
import { TransactionsSortByPipe } from './pipes/transactions-sort-by.pipe';

@NgModule({
    declarations: [TransactionsFilterPipe, TransactionsSortByPipe],
    imports: [CommonModule],
    exports: [TransactionsFilterPipe, TransactionsSortByPipe],
})
export class SharedModule {}
