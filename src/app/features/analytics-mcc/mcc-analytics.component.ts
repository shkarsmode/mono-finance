
import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MccAnalyticsService, MccRow } from './mcc-analytics.service';
import { MCC_LABELS, mccName } from './mcc-map';

type SortKey = keyof Pick<MccRow, 'mcc' | 'txCount' | 'totalSpent' | 'totalIncome' | 'net' | 'avgAbs'>;

@Component({
    standalone: true,
    selector: 'app-mcc-analytics',
    imports: [CommonModule, FormsModule],
    templateUrl: './mcc-analytics.component.html',
    styleUrls: ['./mcc-analytics.component.scss']
})
export class MccAnalyticsComponent {
    private api = inject(MccAnalyticsService);

    from = signal<string>('2023-02-06');  // yyyy-mm-dd
    to = signal<string>('');
    mccInput = signal<string>(''); // raw input token
    mccList = signal<number[]>([]); // parsed MCC list

    search = signal<string>('');
    sortKey = signal<SortKey>('totalSpent');
    sortDir = signal<1 | -1>(-1);

    data = computed(() => this.api.last());
    rows = computed(() => {
        const q = (this.search().trim() || '').toLowerCase();
        const rows = (this.data()?.rows || []).filter(r => {
            if (!q) return true;
            const label = MCC_LABELS[r.mcc] || '';
            const merchants = r.topMerchants.map(x => x.name).join(' ');
            const hay = `${r.mcc} ${label} ${merchants}`.toLowerCase();
            return hay.includes(q);
        });
        const key = this.sortKey();
        const dir = this.sortDir();
        return [...rows].sort((a, b) => {
            const av = a[key] as number;
            const bv = b[key] as number;
            return av === bv ? 0 : av > bv ? dir : -dir;
        });
    });

    totals = computed(() => this.data()?.totals || { totalSpent: 0, totalIncome: 0, net: 0, txCount: 0 });

    constructor() {
        // Auto-fetch YTD on first load
        const now = new Date();
        const ytd = new Date(now.getFullYear(), 0, 1);
        // this.from.set(ytd.toISOString().slice(0, 10));
        this.to.set(now.toISOString().slice(0, 10));
        this.fetch();
    }

    setFrom(event: any): void {
        if (event.target.value)
            this.from.set(event.target.value)
    }

    setTo(event: any): void {
        if (event.target.value)
            this.to.set(event.target.value)
    }

    public setSearch(event: any) {
        this.search.set(event.target.value)
    }

    mccChipAdd(event: any) {
        const raw = event.target.value.trim();
        if (!raw) return;
        raw.split(/[ ,;]+/g).forEach((tok: any) => {
            const n = Number(tok);
            if (!Number.isFinite(n)) return;
            if (!this.mccList().includes(n)) this.mccList.set([...this.mccList(), n]);
        });
        // this.mccInput.set('');
    }
    mccRemove(n: number) {
        this.mccList.set(this.mccList().filter(x => x !== n));
    }
    mccClear() { this.mccList.set([]); }

    async fetch() {
        const from = this.from() || undefined;
        const to = this.to() || undefined;
        const mccCsv = this.mccList().length ? this.mccList().join(',') : undefined;
        console.log(from, to);
        await this.api.fetch(from, to, mccCsv);
    }

    mccName = mccName;

    setSort(key: SortKey) {
        if (this.sortKey() === key) {
            this.sortDir.set(this.sortDir() === 1 ? -1 : 1);
        } else {
            this.sortKey.set(key);
            this.sortDir.set(key === 'mcc' ? 1 : -1);
        }
    }

    formatUAH(n: number) {
        return new Intl.NumberFormat('uk-UA', { style: 'currency', currency: 'UAH', maximumFractionDigits: 2 }).format(n);
    }

    exportCsv() {
        const header = ['MCC', 'Label', 'Tx', 'Spent', 'Income', 'Net', 'Avg', 'TopMerchants'];
        const lines = [header.join(',')];
        for (const r of this.rows()) {
            const tops = r.topMerchants.map(t => `${t.name} (${t.total.toFixed(2)})`).join(' | ').replace(/,/g, ';');
            const row = [
                r.mcc,
                JSON.stringify(this.mccName(r.mcc)),
                r.txCount,
                r.totalSpent.toFixed(2),
                r.totalIncome.toFixed(2),
                r.net.toFixed(2),
                r.avgAbs.toFixed(2),
                JSON.stringify(tops)
            ];
            lines.push(row.join(','));
        }
        const csv = lines.join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mcc-analytics_${this.from() || 'all'}_${this.to() || 'all'}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }
}
