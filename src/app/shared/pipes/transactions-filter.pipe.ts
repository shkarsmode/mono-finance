import { Pipe, PipeTransform } from '@angular/core';
import { ITransaction } from '@core/interfaces';

@Pipe({
    name: 'transactionsFilter',
})
export class TransactionsFilterPipe implements PipeTransform {
    public transform(
        transactions: ITransaction[] | null, 
        searchValue: string
    ): ITransaction[] | null {
        if (!transactions || !searchValue) {
            return transactions;
        }

        const searchValues = searchValue
            .toLowerCase()
            .split(',')
            .map((value) => value.trim());

        return transactions.filter((transaction) => 
            searchValues.some((search) =>
                transaction.description.toLowerCase().includes(search)
            )
        );
    }
}
