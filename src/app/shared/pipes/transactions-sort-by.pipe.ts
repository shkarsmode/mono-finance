import { Pipe, PipeTransform } from '@angular/core';
import { TransactionSortBy } from '@core/enums';
import { ITransaction } from '@core/interfaces';

@Pipe({
    name: 'transactionsSortBy',
    standalone: true,
})
export class TransactionsSortByPipe implements PipeTransform {
    public transform(
        transactions: ITransaction[] | null, 
        sortBy: TransactionSortBy,
        direction: 'asc' | 'desc' = 'asc'
    ): ITransaction[] {
        if (!transactions?.length) return [];

        const copy = [...transactions];

        if (
            sortBy === TransactionSortBy.Amount ||
            sortBy === TransactionSortBy.Date
        ) {
            return copy.sort((a, b) =>
                direction === 'asc'
                    ? a[sortBy] - b[sortBy]
                    : b[sortBy] - a[sortBy]
            );
        }

        return copy.sort((a, b) =>
            direction === 'asc'
                ? a[sortBy].localeCompare(b[sortBy])
                : b[sortBy].localeCompare(a[sortBy])
        );
    }
}
