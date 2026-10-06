import { ChangeDetectionStrategy, Component, HostListener } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/** What you click in quick succession: buttons and the click targets that act like them. */
const CLICK_TARGETS = 'button, [role="button"], .period__nav, .ledger__head, .seg';

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [RouterOutlet],
    // The app used to render three loading bars at once (this one, its inline
    // copy, and the shell's). The shell owns the single progress bar now.
    template: `<router-outlet></router-outlet>`,
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
    /**
     * The 2nd and 3rd press of a fast click series on a control must not start a text
     * selection. `user-select: none` keeps the control's own text clean, but the
     * browser then selects the nearest selectable text instead — stepping months by
     * clicking fast highlighted unrelated labels. Only repeat presses are stopped, so
     * a single click (and its focus) behaves exactly as before.
     */
    @HostListener('document:mousedown', ['$event'])
    public preventMultiClickSelection(event: MouseEvent): void {
        if (event.detail > 1 && (event.target as Element | null)?.closest?.(CLICK_TARGETS)) {
            event.preventDefault();
        }
    }
}
