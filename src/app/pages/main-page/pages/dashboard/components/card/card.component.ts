import { ChangeDetectionStrategy, Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { IAccount } from '@core/interfaces';
import { MaskedCardPipe } from '../../../../pipes/masked-card.pipe';

@Component({
    selector: 'app-card',
    standalone: true,
    imports: [MaskedCardPipe],
    templateUrl: './card.component.html',
    styleUrl: './card.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardComponent {
    @Input() public name: string = '';
    @Input() public account!: IAccount;

    @Output() public onClick: EventEmitter<IAccount> = new EventEmitter();

    @HostListener('click')
    public onCardClick = () => this.onClick.emit(this.account);

    public isSmallScreen: boolean = window.innerWidth < 700;
}
