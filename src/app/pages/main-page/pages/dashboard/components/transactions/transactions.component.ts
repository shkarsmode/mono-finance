import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { ITransaction } from '@core/interfaces';

@Component({
    selector: 'app-transactions',
    templateUrl: './transactions.component.html',
    styleUrl: './transactions.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransactionsComponent {
    @Input() public transactions: ITransaction[] | null;
    @Input() public searchValue: string = '';
    @Output() public searchTransactions: EventEmitter<string> = new EventEmitter();

    public onInputEvent(event: Event): void {
        this.searchTransactions.emit((event.target as HTMLInputElement).value);
    }
}
