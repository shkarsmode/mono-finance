import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, HostBinding, HostListener, Input, Output } from '@angular/core';
import { currencyCodesMap } from '@core/data';
import { cardName } from '@core/helpers/card-names';
import { IAccount } from '@core/interfaces';
import { MaskedCardPipe } from '../../../../pipes/masked-card.pipe';

/** Display only: the type codes themselves stay the filter values. */
export const accountTypeLabel = cardName;

@Component({
    selector: 'app-card',
    standalone: true,
    imports: [MaskedCardPipe, DecimalPipe],
    templateUrl: './card.component.html',
    styleUrl: './card.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardComponent {
    @Input() public name: string = '';
    @Input() public account!: IAccount;

    @Output() public onClick: EventEmitter<IAccount> = new EventEmitter();

    // The tile is a real control: focusable and operable from the keyboard.
    @HostBinding('attr.role') public readonly role = 'button';
    @HostBinding('attr.tabindex') public readonly tabindex = '0';

    @HostListener('click')
    public onCardClick = () => this.onClick.emit(this.account);

    @HostListener('keydown', ['$event'])
    public onKeydown(event: KeyboardEvent): void {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            this.onClick.emit(this.account);
        }
    }

    get typeLabel(): string {
        return accountTypeLabel(this.account?.type);
    }

    get currencyName(): string {
        return currencyCodesMap[this.account?.currencyCode]?.name ?? 'UAH';
    }

    get balanceFormatted(): number {
        return (this.account?.balance ?? 0) / 100;
    }
}
