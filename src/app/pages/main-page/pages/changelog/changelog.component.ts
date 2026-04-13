import { ChangeDetectionStrategy, Component } from '@angular/core';
import { DatePipe } from '@angular/common';

type ChangelogEntry = {
    version: string;
    shippedAt: string;
    title: string;
    summary: string;
    points: string[];
};

@Component({
    selector: 'app-changelog',
    standalone: true,
    imports: [DatePipe],
    templateUrl: './changelog.component.html',
    styleUrl: './changelog.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class ChangelogComponent {
    readonly entries: ChangelogEntry[] = [
        {
            version: 'v0.9.0',
            shippedAt: '2026-04-13',
            title: 'Unified finance display',
            summary: 'Display currency is now driven by live Mono rates and applied across analytics, subscriptions, transactions, insights and calendar views.',
            points: [
                'Live USD and EUR conversion now comes from Mono currency rates.',
                'Transaction lists and charts speak the same display currency.',
                'Card balances stay in their original card currency as before.',
            ],
        },
        {
            version: 'v0.8.0',
            shippedAt: '2026-04-12',
            title: 'Deep sync flow',
            summary: 'Archive loading became calmer and more predictable with a fullscreen sync flow and fixed Mono cooldown handling.',
            points: [
                'Bulk transaction sync now respects a fixed 60 second Mono cooldown.',
                'Progress is shown in a focused overlay instead of noisy repeated toasts.',
                'Month-by-month sync feedback is clearer during long archive scans.',
            ],
        },
        {
            version: 'v0.7.0',
            shippedAt: '2026-04-08',
            title: 'Recurring spending tools',
            summary: 'Subscriptions detection and merchant grouping became easier to scan and maintain.',
            points: [
                'Detected subscriptions now have cleaner cards and confidence markers.',
                'Upcoming recurring charges are highlighted in a separate section.',
                'Recurring payment management became easier to review at a glance.',
            ],
        },
        {
            version: 'v0.6.0',
            shippedAt: '2026-04-02',
            title: 'Monthly analytics refresh',
            summary: 'MCC analytics gained better trend breakdowns and stronger table-level controls.',
            points: [
                'MCC table filtering and sorting became easier to work with.',
                'Inline trend charts help inspect category behavior month over month.',
                'CSV export was added for the current analytics view.',
            ],
        },
    ];
}
