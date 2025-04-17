import { ChangeDetectionStrategy, Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { IAccount } from '@core/interfaces';

@Component({
    selector: 'app-card',
    templateUrl: './card.component.html',
    styleUrl: './card.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardComponent {
    @Input() public name: string;
    @Input() public account: IAccount;

    @Output() public onClick: EventEmitter<IAccount> = new EventEmitter();

    @HostListener('click')
    public onCardClick = () => this.onClick.emit(this.account);

    public isAchievedLessThan700px: boolean = window.innerWidth < 700;
}
