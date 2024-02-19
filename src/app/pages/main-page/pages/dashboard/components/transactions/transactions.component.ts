import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { ITransaction } from '@core/interfaces';

@Component({
    selector: 'app-transactions',
    templateUrl: './transactions.component.html',
    styleUrl: './transactions.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransactionsComponent {
    @Input() public transactions: ITransaction[] | null;
}
