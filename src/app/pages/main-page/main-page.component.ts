import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ChildrenOutletContexts } from '@angular/router';
import { MonobankService } from '@core/services';

@Component({
    selector: 'app-main-page',
    templateUrl: './main-page.component.html',
    styleUrl: './main-page.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MainPageComponent {
    constructor(
        private readonly contexts: ChildrenOutletContexts,
        private mono: MonobankService
    ) {}

    public getRouteAnimationData() {
        return this.contexts.getContext('primary')?.route?.snapshot?.data?.[
            'animation'
        ];
    }
}
