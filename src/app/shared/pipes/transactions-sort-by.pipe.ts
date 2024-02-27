import { Pipe, PipeTransform } from '@angular/core';
import { TransactionSortBy } from '@core/enums';
import { ITransaction } from '@core/interfaces';

@Pipe({
    name: 'transactionsSortBy',
})
export class TransactionsSortByPipe implements PipeTransform {
    public transform(
        transactions: ITransaction[] | null, 
        sortBy: TransactionSortBy,
        direction: 'asc' | 'desc' = 'asc'
    ): ITransaction[] {
        if (!transactions) return [];
        if (sortBy === TransactionSortBy.Date) {
            return transactions.sort((a, b) =>
                direction === 'asc' ? a.time - b.time : b.time - a.time
            );
        }
        

        return transactions.sort((a, b) =>
            direction === 'asc'
                ? a[sortBy].localeCompare(b[sortBy])
                : b[sortBy].localeCompare(a[sortBy])
        );
    }
}
