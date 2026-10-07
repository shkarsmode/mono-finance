import { CdkConnectedOverlay, ConnectedPosition, OverlayModule } from '@angular/cdk/overlay';
import {
    ChangeDetectionStrategy, Component, computed, DestroyRef, ElementRef, inject, input, output, signal, ViewChild,
} from '@angular/core';
import { AccountView } from './accounts';

const BELOW_END: ConnectedPosition[] = [
    { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 6 },
    { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -6 },
];
const BELOW_START: ConnectedPosition[] = [
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 6 },
    { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -6 },
];

/**
 * The card the whole screen is about, as one control. A click opens every account
 * with its own money (credit limit left out); picking one switches the dashboard,
 * the small button on each row copies that account's IBAN.
 *
 * 'chip' is the compact button for a toolbar; 'card' is the card itself — name,
 * number and balance — as the button, for the hero.
 */
@Component({
    selector: 'app-account-switcher',
    standalone: true,
    imports: [OverlayModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { '[class.is-card]': "variant() === 'card'" },
    template: `
        <button #trigger type="button" class="sw"
                cdkOverlayOrigin #origin="cdkOverlayOrigin"
                [class.sw--card]="variant() === 'card'"
                [class.sw--open]="open()"
                [disabled]="!accounts().length"
                aria-haspopup="dialog"
                [attr.aria-expanded]="open()"
                [attr.aria-label]="triggerLabel()"
                (click)="toggle()">
            <span class="sw__line">
                <svg class="glyph" viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="5.5" width="19" height="13" rx="2.5" /><path d="M2.5 9.5h19M6 14.5h4" /></svg>
                @if (active(); as a) {
                    <span class="sw__name">{{ a.name }}</span>
                    @if (a.currency !== 'UAH') {
                        <span class="cur">{{ a.currency }}</span>
                    }
                    @if (a.last4) {
                        <span class="pan mono"><span class="pan__dots">••••</span>&nbsp;{{ a.last4 }}</span>
                    }
                } @else if (accounts().length) {
                    <span class="sw__name">Вибрати картку</span>
                } @else {
                    <span class="sw__ghost" aria-hidden="true"></span>
                }
                <svg class="sw__chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
            </span>
            @if (variant() === 'card') {
                @if (active(); as a) {
                    <span class="sw__money">
                        <span class="sw__bal num balance-value">{{ a.ownText }}</span>
                        @if (a.limitText) {
                            <span class="sw__meta num">кредитний ліміт {{ a.limitText }}</span>
                        } @else if (a.uahText) {
                            <span class="sw__meta num balance-value">{{ a.uahText }}</span>
                        }
                    </span>
                }
            }
        </button>

        <ng-template cdkConnectedOverlay
                     [cdkConnectedOverlayOrigin]="origin"
                     [cdkConnectedOverlayOpen]="open()"
                     [cdkConnectedOverlayPositions]="positions()"
                     [cdkConnectedOverlayPush]="true"
                     [cdkConnectedOverlayViewportMargin]="12"
                     (attach)="onAttach()"
                     (detach)="onDetach()"
                     (overlayOutsideClick)="onOutsideClick($event)"
                     (overlayKeydown)="onKeydown($event)">
            <div class="pop" role="dialog" aria-label="Картки">
                <ul class="pop__list">
                    @for (a of accounts(); track a.id) {
                        <li class="row" [class.row--on]="a.id === activeId()">
                            <button type="button" class="row__pick"
                                    [attr.aria-current]="a.id === activeId() ? 'true' : null"
                                    (click)="choose(a, $event)">
                                <svg class="glyph" viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="5.5" width="19" height="13" rx="2.5" /><path d="M2.5 9.5h19M6 14.5h4" /></svg>
                                <span class="row__id">
                                    <span class="row__name">{{ a.name }}@if (a.currency !== 'UAH') {<span class="cur">{{ a.currency }}</span>}</span>
                                    @if (a.last4) {
                                        <span class="pan mono"><span class="pan__dots">••••</span>&nbsp;{{ a.last4 }}</span>
                                    } @else {
                                        <span class="pan">рахунок</span>
                                    }
                                </span>
                                <span class="row__money">
                                    <span class="row__bal num balance-value">{{ a.ownText }}</span>
                                    @if (a.uahText) {
                                        <span class="row__sub num balance-value">{{ a.uahText }}</span>
                                    } @else if (a.limitText) {
                                        <span class="row__sub num">ліміт {{ a.limitText }}</span>
                                    }
                                </span>
                            </button>
                            @if (a.copyValue) {
                                <button type="button" class="row__copy"
                                        [class.row__copy--done]="copiedId() === a.id"
                                        [attr.aria-label]="copyLabel(a)"
                                        [title]="a.copyIsIban ? 'Копіювати IBAN' : 'Копіювати номер картки'"
                                        (click)="copyAccount.emit(a.id)">
                                    @if (copiedId() === a.id) {
                                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                                    } @else {
                                        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a1 1 0 0 1 1-1h9" /></svg>
                                    }
                                </button>
                            }
                        </li>
                    }
                </ul>
            </div>
        </ng-template>
    `,
    styles: [`
        :host {
            display: inline-flex;
            min-width: 0;
        }

        /* the card variant fills its slot; its balance sizes to that slot, never past it */
        :host(.is-card) {
            display: block;
            container-type: inline-size;
        }

        /* ── trigger ─────────────────────────────────────────── */
        .sw {
            display: inline-flex;
            align-items: center;
            max-width: 100%;
            height: var(--control-lg);
            padding: 0 var(--space-2) 0 var(--space-3);
            border: 1px solid var(--line-2);
            border-radius: var(--radius-sm);
            background: var(--surface);
            color: var(--ink);
            font: inherit;
            font-size: var(--fs-meta);
            text-align: left;
            white-space: nowrap;
            cursor: pointer;
            transition: background var(--dur-fast) var(--ease);

            &:hover:not(:disabled) { background: var(--hover); }
            &:disabled { cursor: default; }
        }

        .sw--open { background: var(--hover); }

        .sw__line {
            display: flex;
            align-items: center;
            gap: var(--space-2);
            min-width: 0;
            max-width: 100%;
        }

        .glyph {
            flex: none;
            width: 18px;
            height: 18px;
            fill: none;
            stroke: var(--ink-3);
            stroke-width: 1.7;
            stroke-linecap: round;
            stroke-linejoin: round;
        }

        .sw__name {
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            font-weight: 600;
            color: var(--ink);
        }

        .cur {
            flex: none;
            margin-left: 6px;
            font-size: var(--fs-micro);
            font-weight: 600;
            letter-spacing: 0.04em;
            color: var(--ink-3);
        }

        .sw__line .cur { margin-left: 0; }

        .pan {
            flex: none;
            font-size: 12px;
            color: var(--ink-3);
            white-space: nowrap;
        }

        /* four dots read as one mark, not as four characters */
        .pan__dots { letter-spacing: -0.12em; }

        .sw__chev {
            flex: none;
            width: 14px;
            height: 14px;
            fill: none;
            stroke: var(--ink-3);
            stroke-width: 2.2;
            stroke-linecap: round;
            stroke-linejoin: round;
        }

        .sw__ghost {
            width: 88px;
            height: 10px;
            border-radius: 5px;
            background: var(--skeleton);
        }

        /* the card itself is the button: no frame, a quiet hover wash around the text */
        .sw--card {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            gap: 2px;
            width: calc(100% + 16px);
            max-width: none;
            height: auto;
            margin: -6px -8px;
            padding: 6px 8px;
            border: 0;
            background: none;

            .sw__line { gap: 6px; color: var(--ink-2); }
            .glyph { width: 17px; height: 17px; }
        }

        .sw--card.sw--open { background: var(--hover); }

        .sw__money {
            display: flex;
            align-items: baseline;
            flex-wrap: wrap;
            column-gap: var(--space-2);
            max-width: 100%;
        }

        .sw__bal {
            font-size: var(--fs-h1);
            font-size: clamp(17px, 10.5cqi, var(--fs-h1));
            font-weight: 600;
            line-height: var(--lh-snug);
            letter-spacing: var(--tracking-tight);
            color: var(--ink);
            white-space: nowrap;
        }

        .sw__meta {
            font-size: var(--fs-micro);
            color: var(--ink-3);
            white-space: nowrap;
        }

        /* ── popover ─────────────────────────────────────────── */
        .pop {
            width: min(380px, calc(100vw - 24px));
            max-height: min(72vh, 540px);
            overflow-y: auto;
            overscroll-behavior: contain;
            padding: var(--space-1);
            background: var(--surface);
            border: 1px solid var(--line-2);
            border-radius: var(--radius-md);
            box-shadow: var(--shadow-pop);
            animation: pop-fade 140ms var(--ease);
        }

        @keyframes pop-fade {
            from { opacity: 0; }
        }

        .pop__list {
            display: flex;
            flex-direction: column;
            gap: 2px;
            margin: 0;
            padding: 0;
            list-style: none;
        }

        .row {
            display: flex;
            align-items: center;
            border-radius: var(--radius-sm);
            transition: background var(--dur-fast) var(--ease);

            &:hover { background: var(--hover); }
        }

        .row--on,
        .row--on:hover { background: var(--accent-tint); }

        .row__pick {
            flex: 1;
            min-width: 0;
            display: flex;
            align-items: center;
            gap: var(--space-3);
            min-height: 54px;
            padding: var(--space-2) var(--space-2) var(--space-2) var(--space-3);
            border: 0;
            border-radius: var(--radius-sm);
            background: none;
            color: var(--ink);
            font: inherit;
            text-align: left;
            cursor: pointer;
        }

        .row--on .glyph { stroke: var(--accent); }

        .row__id {
            flex: 1;
            min-width: 0;
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            gap: 1px;
        }

        .row__name {
            max-width: 100%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            font-size: var(--fs-body);
            font-weight: 500;
        }

        .row--on .row__name { font-weight: 600; }

        .row__id .pan { font-size: var(--fs-micro); }

        .row__money {
            flex: none;
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            gap: 1px;
        }

        .row__bal {
            font-size: var(--fs-body);
            font-weight: 600;
            white-space: nowrap;
        }

        .row__sub {
            font-size: var(--fs-micro);
            color: var(--ink-3);
            white-space: nowrap;
        }

        .row__copy {
            flex: none;
            display: grid;
            place-items: center;
            width: 36px;
            height: 36px;
            margin-right: var(--space-1);
            border: 0;
            border-radius: var(--radius-sm);
            background: none;
            color: var(--ink-3);
            cursor: pointer;
            transition: background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);

            svg {
                width: 16px;
                height: 16px;
                fill: none;
                stroke: currentColor;
                stroke-width: 1.8;
                stroke-linecap: round;
                stroke-linejoin: round;
                animation: pop-fade 120ms var(--ease);
            }

            &:hover { background: var(--sunken); color: var(--ink); }
        }

        .row__copy--done,
        .row__copy--done:hover { color: var(--accent); }
    `],
})
export class AccountSwitcherComponent {
    public readonly accounts = input<readonly AccountView[]>([]);
    public readonly activeId = input<string | null>(null);
    /** The account whose IBAN was just copied — its button shows a check for a moment. */
    public readonly copiedId = input<string | null>(null);
    public readonly variant = input<'chip' | 'card'>('chip');

    public readonly chooseAccount = output<string>();
    public readonly copyAccount = output<string>();

    public readonly open = signal(false);
    public readonly active = computed(() => this.accounts().find(a => a.id === this.activeId()) ?? null);

    /** The chip sits at the right of a toolbar, the card at the left of the hero: the list opens under them. */
    public readonly positions = computed(() => (this.variant() === 'card' ? BELOW_START : BELOW_END));

    public readonly triggerLabel = computed(() => {
        const a = this.active();
        if (!a) return 'Вибрати картку';
        const currency = a.currency !== 'UAH' ? ` ${a.currency}` : '';
        const tail = a.last4 ? `, закінчується на ${a.last4}` : '';
        const balance = this.variant() === 'card' ? `, ${a.ownText}` : '';
        return `Картка ${a.name}${currency}${tail}${balance}. Змінити картку`;
    });

    @ViewChild('trigger') private readonly trigger?: ElementRef<HTMLButtonElement>;
    @ViewChild(CdkConnectedOverlay) private readonly overlay?: CdkConnectedOverlay;

    constructor() {
        inject(DestroyRef).onDestroy(() => this.watchScroll(false));
    }

    public toggle(): void {
        this.open.set(!this.open());
    }

    public choose(account: AccountView, event: MouseEvent): void {
        // detail 0: Enter or Space — keyboard users get their focus back on the button
        this.close(event.detail === 0);
        if (account.id !== this.activeId()) this.chooseAccount.emit(account.id);
    }

    public copyLabel(a: AccountView): string {
        const card = `${a.name}${a.last4 ? `, закінчується на ${a.last4}` : ''}`;
        return a.copyIsIban ? `Копіювати IBAN: ${card}` : `Копіювати номер картки: ${card}`;
    }

    public onAttach(): void {
        this.watchScroll(true);
        // start on the active card, so arrows and Enter have a place to begin
        queueMicrotask(() => {
            const pane = this.pane();
            const target = pane?.querySelector<HTMLButtonElement>('.row--on .row__pick') ?? pane?.querySelector<HTMLButtonElement>('.row__pick');
            target?.focus({ preventScroll: true });
        });
    }

    public onDetach(): void {
        this.watchScroll(false);
        this.open.set(false);
    }

    /** The button itself toggles; without this check a click on it would close and reopen. */
    public onOutsideClick(event: MouseEvent): void {
        if (this.trigger?.nativeElement.contains(event.target as Node)) return;
        this.close(false);
    }

    public onKeydown(event: KeyboardEvent): void {
        if (event.key === 'Escape') {
            event.preventDefault();
            this.close(true);
            return;
        }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;

        const rows = Array.from(this.pane()?.querySelectorAll<HTMLButtonElement>('.row__pick') ?? []);
        if (!rows.length) return;
        event.preventDefault();
        const focused = document.activeElement;
        const current = rows.findIndex(row => row.parentElement?.contains(focused) ?? false);
        let next = current;
        if (event.key === 'ArrowDown') next = current < 0 ? 0 : Math.min(rows.length - 1, current + 1);
        if (event.key === 'ArrowUp') next = current < 0 ? rows.length - 1 : Math.max(0, current - 1);
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = rows.length - 1;
        rows[next]?.focus({ preventScroll: true });
    }

    private close(refocus: boolean): void {
        if (!this.open()) return;
        this.open.set(false);
        if (refocus) this.trigger?.nativeElement.focus({ preventScroll: true });
    }

    private pane(): HTMLElement | null {
        return this.overlay?.overlayRef?.overlayElement ?? null;
    }

    /**
     * The page scrolls inside the app shell, not the window, so the overlay cannot
     * follow its button: a scroll anywhere outside the list closes it instead of
     * leaving it floating over the wrong place.
     */
    private readonly onScroll = (event: Event): void => {
        const pane = this.pane();
        if (pane && event.target instanceof Node && pane.contains(event.target)) return;
        this.close(false);
    };

    private watchScroll(on: boolean): void {
        if (on) document.addEventListener('scroll', this.onScroll, { capture: true, passive: true });
        else document.removeEventListener('scroll', this.onScroll, { capture: true });
    }
}
