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
        return transactions && transactions.filter((transaction) =>
            transaction.description
                .toLowerCase()
                .includes(searchValue.toLocaleLowerCase())
        );
    }
}
