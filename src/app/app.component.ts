import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [RouterOutlet],
    // The app used to render three loading bars at once (this one, its inline
    // copy, and the shell's). The shell owns the single progress bar now.
    template: `<router-outlet></router-outlet>`,
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {}
