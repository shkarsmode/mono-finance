import { DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
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
    imports: [DecimalPipe],
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
