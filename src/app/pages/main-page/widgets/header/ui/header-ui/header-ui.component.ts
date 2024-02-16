import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
    selector: 'app-header-ui',
    templateUrl: './header-ui.component.html',
    styleUrl: './header-ui.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class HeaderUiComponent {}
