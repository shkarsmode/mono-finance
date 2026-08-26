import { DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { DisplayMoneyPipe } from '../../../../shared/pipes/display-money.pipe';
import { BASE_PATH_API } from '@core/tokens/monobank-environment.tokens';

interface Insight {
    id: string;
    type: 'anomaly' | 'trend' | 'new-merchant' | 'burst' | 'milestone' | 'comparison';
    severity: 'info' | 'warn' | 'critical';
    title: string;
    description: string;
    value?: number;
    previousValue?: number;
    changePercent?: number;
    merchantKey?: string;
    mcc?: number;
    period?: string;
    detectedAt: number;
}

@Component({
    selector: 'app-insights',
    standalone: true,
    imports: [DecimalPipe, DisplayMoneyPipe],
    templateUrl: './insights.component.html',
    styleUrl: './insights.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class InsightsComponent implements OnInit {
    private readonly http = inject(HttpClient);
    private readonly baseApi = inject(BASE_PATH_API);

    readonly insights = signal<Insight[]>([]);
    readonly loading = signal(true);
    readonly error = signal<string | null>(null);

    ngOnInit(): void {
        this.loadInsights();
    }

    loadInsights(): void {
        this.loading.set(true);
        this.error.set(null);
        this.http.get<Insight[]>(`${this.baseApi}/insights`).subscribe({
            next: (data) => {
                this.insights.set(data);
                this.loading.set(false);
            },
            error: (err) => {
                this.error.set(err?.error?.message ?? 'Failed to load insights');
                this.loading.set(false);
            },
        });
    }

    /** Critical first and visually dominant — a burst of "info" must not bury it. */
    readonly bands = computed(() => {
        const all = this.insights().filter(i => !this.dismissed().has(i.id));
        const order: Array<Insight['severity']> = ['critical', 'warn', 'info'];
        return order
            .map(severity => ({
                severity,
                label: severity === 'critical' ? 'Needs attention' : severity === 'warn' ? 'Worth a look' : 'For information',
                items: all.filter(i => i.severity === severity),
            }))
            .filter(band => band.items.length > 0);
    });

    readonly dismissed = signal<Set<string>>(new Set());
    readonly visibleCount = computed(() => this.bands().reduce((n, b) => n + b.items.length, 0));

    dismiss(id: string): void {
        const next = new Set(this.dismissed());
        next.add(id);
        this.dismissed.set(next);
    }

    /** "new-merchant" is not a label a person should read. */
    typeLabel(type: string): string {
        switch (type) {
            case 'anomaly': return 'Unusual day';
            case 'comparison': return 'Vs last month';
            case 'new-merchant': return 'New merchant';
            case 'burst': return 'Spending burst';
            case 'trend': return 'Trend';
            case 'milestone': return 'Milestone';
            default: return 'Insight';
        }
    }

    /** Direction is stated in words too, so colour is never the only signal. */
    changeLabel(insight: Insight): string | null {
        if (insight.changePercent === undefined || insight.changePercent === null) return null;
        const pct = Math.abs(Math.round(insight.changePercent));
        return `${insight.changePercent >= 0 ? '↑' : '↓'} ${pct}% vs last month`;
    }

    detectedLabel(insight: Insight): string {
        return new Date(insight.detectedAt * 1000).toLocaleString(undefined, {
            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
        });
    }

    severityIcon(severity: string): string {
        switch (severity) {
            case 'critical': return 'error';
            case 'warn': return 'warning';
            default: return 'info';
        }
    }

    typeIcon(type: string): string {
        switch (type) {
            case 'anomaly': return 'trending_up';
            case 'comparison': return 'compare_arrows';
            case 'new-merchant': return 'storefront';
            case 'burst': return 'bolt';
            case 'trend': return 'show_chart';
            case 'milestone': return 'emoji_events';
            default: return 'lightbulb';
        }
    }
}
