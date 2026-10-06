import { DatePipe, DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, OnInit } from '@angular/core';
import { currencyCodesMap } from '@core/data';
import { CurrencyDisplayService } from '@core/services';
import { ISubscription, SubscriptionService } from '@core/services/subscription.service';
import { first } from 'rxjs';
import { DisplayMoneyPipe } from '../../../../shared/pipes/display-money.pipe';
import { DisplayMoneyMajorPipe } from '../../../../shared/pipes/display-money-major.pipe';

@Component({
    selector: 'app-subscriptions',
    standalone: true,
    imports: [DatePipe, DecimalPipe, NgTemplateOutlet, DisplayMoneyPipe, DisplayMoneyMajorPipe],
    templateUrl: './subscriptions.component.html',
    styleUrl: './subscriptions.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class SubscriptionsComponent implements OnInit {
    private readonly subService = inject(SubscriptionService);
    readonly currencyDisplay = inject(CurrencyDisplayService);

    readonly subscriptions = this.subService.subscriptions;
    readonly isLoading = this.subService.isLoading;
    readonly isDetecting = this.subService.isDetecting;

    readonly activeSubs = computed(() =>
        (this.subscriptions() ?? []).filter(s => s?.isActive)
    );

    readonly pausedSubs = computed(() => (this.subscriptions() ?? []).filter(s => s && !s.isActive));

    /** Low-confidence detections are flagged for review instead of shown as fact. */
    readonly confidentSubs = computed(() => this.activeSubs().filter(s => (s.confidence ?? 0) >= 0.5));
    readonly reviewSubs = computed(() => this.activeSubs().filter(s => (s.confidence ?? 0) < 0.5));

    /**
     * The real monthly cost. This used to count only cadence === 'monthly', so a weekly
     * subscription — the expensive kind — was left out entirely and the headline figure
     * understated what actually leaves the account each month.
     */
    readonly totalMonthly = computed(() =>
        this.activeSubs().reduce((sum, s) => sum + this.monthlyEquivalent(s), 0)
    );

    monthlyEquivalent(sub: ISubscription): number {
        const amount = this.currencyDisplay.convertMinorAmount(Math.abs(sub.averageAmount), sub.currency);
        if (sub.cadence === 'weekly') return amount * 52 / 12;
        return amount;
    }

    /**
     * lastSeenAt / nextExpectedAt are bigint columns, so they arrive as a string of
     * UNIX SECONDS. Passing that straight to new Date() produced an Invalid Date, which
     * silently emptied the "Coming Up" list.
     */
    toDate(value: string | number | null | undefined): Date | null {
        if (value === null || value === undefined || value === '') return null;
        const n = Number(value);
        if (!Number.isFinite(n)) return null;
        return new Date(n < 1e12 ? n * 1000 : n);
    }

    readonly upcomingSubs = computed(() => {
        const weekFromNow = Date.now() + 7 * 24 * 60 * 60 * 1000;
        return this.activeSubs()
            .map(s => ({ sub: s, at: this.toDate(s.nextExpectedAt)?.getTime() ?? null }))
            .filter(x => x.at !== null && x.at <= weekFromNow)
            .sort((a, b) => (a.at as number) - (b.at as number))
            .map(x => x.sub);
    });

    ngOnInit(): void {
        this.subService.loadAll().pipe(first()).subscribe();
    }

    onDetect(): void {
        this.subService.detect().pipe(first()).subscribe();
    }

    onToggle(sub: ISubscription): void {
        this.subService.toggleActive(sub.id, !sub.isActive).pipe(first()).subscribe();
    }

    getCurrencyName(code: number | string): string {
        if (typeof code === 'string' && code.trim()) {
            return code.toUpperCase();
        }
        return currencyCodesMap[Number(code)]?.name ?? 'UAH';
    }

    getCadenceLabel(cadence: string): string {
        switch (cadence) {
            case 'monthly': return 'Щомісяця';
            case 'weekly': return 'Щотижня';
            default: return 'Регулярно';
        }
    }

    getCadenceIcon(cadence: string): string {
        switch (cadence) {
            case 'monthly': return 'calendar_month';
            case 'weekly': return 'date_range';
            default: return 'autorenew';
        }
    }

    getConfidenceClass(confidence: number): string {
        if (confidence >= 0.8) return 'high';
        if (confidence >= 0.5) return 'medium';
        return 'low';
    }
}
