// mcc-analytics.component.ts
import { ChangeDetectorRef, Component, computed, inject, signal } from '@angular/core';
import { ChartType } from '@core/enums';
import { Subscription } from 'rxjs';
import { MccAnalyticsService, MccRow, MonthlyPoint, TrendTarget } from './mcc-analytics.service';
import { MCC_LABELS, mccName } from './mcc-map';

type SortKey = keyof Pick<MccRow, 'mcc' | 'txCount' | 'totalSpent' | 'totalIncome' | 'net' | 'avgAbs'>;

@Component({
    selector: 'app-mcc-analytics',
    templateUrl: './mcc-analytics.component.html',
    styleUrls: ['./mcc-analytics.component.scss']
})
export class MccAnalyticsComponent {
    private api = inject(MccAnalyticsService);
    public readonly ChartType: typeof ChartType = ChartType;
    private cdr = inject(ChangeDetectorRef);

    from = signal<string>('2025-01-01'); // yyyy-mm-dd
    to = signal<string>('');
    mccInput = signal<string>('');
    mccList = signal<number[]>([]);

    search = signal<string>('');
    sortKey = signal<SortKey>('totalSpent');
    sortDir = signal<1 | -1>(-1);

    data = computed(() => this.api.last());
    rows = computed(() => {
        const query = (this.search().trim() || '').toLowerCase();
        const list = (this.data()?.rows || []).filter(r => {
            if (!query) return true;
            const label = MCC_LABELS[r.mcc] || '';
            const merchants = r.topMerchants.map(x => x.name).join(' ');
            const hay = `${r.mcc} ${label} ${merchants}`.toLowerCase();
            return hay.includes(query);
        });
        const key = this.sortKey();
        const dir = this.sortDir();
        return [...list].sort((a, b) => {
            const av = a[key] as number;
            const bv = b[key] as number;
            return av === bv ? 0 : av > bv ? dir : -dir;
        });
    });

    totals = computed(() => this.data()?.totals || { totalSpent: 0, totalIncome: 0, net: 0, txCount: 0 });

    // ==== Trend state (inline panel) ====
    selectedTrendLabel = '';
    expandedKey = signal<string | null>(null);   // 'mcc:5732' / 'merchant:xxx'
    monthlyTrend: MonthlyPoint[] = [];
    trendLoading = false;
    trendPercent = signal(0);
    trendCurrent = signal(0); // kept for UI compatibility; equals total when loaded
    trendTotal = signal(0);
    private trendSub?: Subscription;

    public trendEtaMs = signal<number | null>(null);

    constructor() {
        const now = new Date();
        this.to.set(now.toISOString().slice(0, 10));
        this.fetch();
    }

    // Period for charts (seconds)
    public period = computed(() => {
        const f = this.from(); const t = this.to();
        const fromSec = f ? Math.floor(Date.parse(f) / 1000) : Math.floor(Date.now() / 1000);
        const toSec = t ? Math.floor(Date.parse(t) / 1000) : Math.floor(Date.now() / 1000);
        return { fromSec, toSec };
    });

    // ========= Table interactions =========
    rowKey = (mcc: number) => `mcc:${mcc}`;

    openTrendForMcc(row: { mcc: number; label: string }) {
        const key = this.rowKey(row.mcc);
        if (this.expandedKey() === key) { this.clearTrend(); return; }
        this.selectedTrendLabel = `MCC ${row.mcc} · ${row.label}`;
        this.expandedKey.set(key);
        this.openTrend({ kind: 'mcc', key: row.mcc });
    }

    openTrendForMerchant(name: string) {
        const key = `merchant:${name}`;
        if (this.expandedKey() === key) { this.clearTrend(); return; }
        this.selectedTrendLabel = name;
        this.expandedKey.set(key);
        this.openTrend({ kind: 'merchant', key: name });
    }

    public clearTrend(): void {
        this.trendSub?.unsubscribe();
        this.expandedKey.set(null);
        this.selectedTrendLabel = '';
        this.monthlyTrend = [];
        this.trendLoading = false;
        this.trendPercent.set(0);
        this.trendCurrent.set(0);
        this.trendTotal.set(0);
        this.trendEtaMs.set(null);
        this.cdr.markForCheck();
    }
    
    private openTrend(target: TrendTarget) {
        this.trendSub?.unsubscribe();
    
        this.trendLoading = true;
        this.monthlyTrend = [];
        this.trendPercent.set(0);
        this.trendCurrent.set(0);
        this.trendTotal.set(0);
        this.trendEtaMs.set(null);
        this.cdr.markForCheck();
    
        const fromISO = this.from();
        const toISO = this.to();
    
        // если используешь версию с прогрессом
        this.trendSub = this.api.getMonthlyTrendWithProgress(fromISO, toISO, target).subscribe({
            next: (ev) => {
                if (!ev.done) {
                    this.trendPercent.set(Math.max(0, Math.min(100, ev.percent ?? 0)));
                    this.trendEtaMs.set(ev.etaMs ?? null);
                    this.cdr.markForCheck();
                    return;
                }
                this.monthlyTrend = ev.points ?? [];
                this.trendTotal.set(this.monthlyTrend.length);
                this.trendCurrent.set(this.monthlyTrend.length);
                this.trendPercent.set(100);
                this.trendEtaMs.set(0);
                this.trendLoading = false;
                this.cdr.markForCheck();
            },
            error: (err) => {
                console.error('Trend error', err);
                this.trendLoading = false;
                this.trendPercent.set(0);
                this.trendCurrent.set(0);
                this.trendTotal.set(0);
                this.trendEtaMs.set(null);
                this.cdr.markForCheck();
            },
            complete: () => {
                this.trendLoading = false;
                this.cdr.markForCheck();
            }
        });
    }

    // ========= Filters / Fetch =========
    setFrom(e: any) { if (e.target.value) this.from.set(e.target.value); }
    setTo(e: any) { if (e.target.value) this.to.set(e.target.value); }

    setSearch(e: any) { this.search.set(e.target.value); }

    mccChipAdd(e: any) {
        const raw = e.target.value.trim();
        if (!raw) return;
        raw.split(/[ ,;]+/g).forEach((tok: any) => {
            const n = Number(tok);
            if (!Number.isFinite(n)) return;
            if (!this.mccList().includes(n)) this.mccList.set([...this.mccList(), n]);
        });
    }
    mccRemove(n: number) { this.mccList.set(this.mccList().filter(x => x !== n)); }
    mccClear() { this.mccList.set([]); }

    async fetch() {
        const from = this.from() || undefined;
        const to = this.to() || undefined;
        const mccCsv = this.mccList().length ? this.mccList().join(',') : undefined;
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
