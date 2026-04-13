import { Pipe, PipeTransform } from '@angular/core';
import { ITransaction } from '@core/interfaces';

@Pipe({
    name: 'transactionsFilter',
    standalone: true,
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
            .map((value) => value.trim())
            .filter(Boolean);

        return transactions.filter((transaction) => 
            searchValues.some((search) => {
                // MCC match: purely numeric search token
                if (/^\d+$/.test(search)) {
                    const mcc = Number(search);
                    return transaction.mcc === mcc || transaction.originalMcc === mcc;
                }
                // Text match: description, counterName, merchantName
                const desc = (transaction.description ?? '').toLowerCase();
                const counter = (transaction.counterName ?? '').toLowerCase();
                const merchant = ((transaction as any).merchantName ?? '').toLowerCase();
                return desc.includes(search) || counter.includes(search) || merchant.includes(search);
            })
        );
    }
}
