import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { ChartComponent } from '../pages/main-page/pages/dashboard/components';
import { TransactionsFilterPipe } from './pipes/transactions-filter.pipe';
import { TransactionsSortByPipe } from './pipes/transactions-sort-by.pipe';

@NgModule({
    declarations: [TransactionsFilterPipe, TransactionsSortByPipe, ChartComponent],
    imports: [CommonModule],
    exports: [TransactionsFilterPipe, TransactionsSortByPipe, ChartComponent],
})
export class SharedModule {}
