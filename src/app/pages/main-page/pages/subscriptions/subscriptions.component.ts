import { DatePipe, DecimalPipe } from '@angular/common';
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
    imports: [DatePipe, DecimalPipe, DisplayMoneyPipe, DisplayMoneyMajorPipe],
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

    readonly totalMonthly = computed(() => {
        return this.activeSubs()
            .filter(s => s.cadence === 'monthly')
            .reduce((sum, s) => sum + this.currencyDisplay.convertMinorAmount(Math.abs(s.averageAmount), s.currency), 0);
    });

    readonly upcomingSubs = computed(() => {
        const now = Date.now();
        const weekFromNow = now + 7 * 24 * 60 * 60 * 1000;
        return this.activeSubs()
            .filter(s => s.nextExpectedAt && new Date(s.nextExpectedAt).getTime() <= weekFromNow)
            .sort((a, b) =>
                new Date(a.nextExpectedAt!).getTime() - new Date(b.nextExpectedAt!).getTime()
            );
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
            case 'monthly': return 'Monthly';
            case 'weekly': return 'Weekly';
            default: return 'Recurring';
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
