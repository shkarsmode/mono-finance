
import { ChangeDetectorRef, Component, computed, inject, signal } from '@angular/core';
import { ChartType } from '@core/enums';
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

    from = signal<string>('2025-01-01');  // '2023-02-06' // yyyy-mm-dd
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

    private cdr = inject(ChangeDetectorRef);

    constructor() {
        // Auto-fetch YTD on first load
        const now = new Date();
        const ytd = new Date(now.getFullYear(), 0, 1);
        // this.from.set(ytd.toISOString().slice(0, 10));
        this.to.set(now.toISOString().slice(0, 10));
        this.fetch();
    }

    selectedTrendLabel = '';

    public trendLoading = false;
    public monthlyTrend: MonthlyPoint[] | any = [];

    public clearTrend(): void {
        this.selectedTrendLabel = '';
        this.monthlyTrend = [];
        this.trendLoading = false;
        this.cdr.markForCheck();
    }
    

    public period = computed(() => {
        const fromDate = this.from() ? new Date(this.from()) : null;
        const toDate = this.to() ? new Date(this.to()) : null;
      
        return {
          fromSec: fromDate ? Math.floor(fromDate.getTime() / 1000) : 0,
          toSec: toDate ? Math.floor(toDate.getTime() / 1000) : 0
        };
      });
    public async openTrend(target: TrendTarget) {
        this.trendLoading = true; this.monthlyTrend = []; this.cdr.markForCheck();

        const fromISO = this.from(); // возьми из твоих датпикеров
        const toISO = this.to();

        
        this.monthlyTrend = await this.api.getMonthlyTrendCompat(fromISO, toISO, target).toPromise();
        console.log(this.monthlyTrend);

        // zero-fill: на случай, если где-то нет месяца в ответе
        this.monthlyTrend = this.zeroFill(fromISO, toISO, this.monthlyTrend);
        console.log(this.monthlyTrend);
        this.trendLoading = false;
        this.cdr.markForCheck();
    }

    openTrendForMcc(row: { mcc: number; label: string }) {
        this.selectedTrendLabel = `MCC ${row.mcc} · ${row.label}`;
        this.openTrend({ kind: 'mcc', key: row.mcc });
      }
    openTrendForMerchant(name: string) {
        this.selectedTrendLabel = name;
        this.openTrend({ kind: 'merchant', key: name });
    }

    private zeroFill(fromISO: string, toISO: string, rows: MonthlyPoint[]): MonthlyPoint[] {
        const map = new Map<string, MonthlyPoint>();
        for (const r of rows) map.set(`${r.year}-${r.month}`, r);

        const filled: MonthlyPoint[] = [];
        let y = new Date(fromISO).getFullYear();
        let m = new Date(fromISO).getMonth() + 1;
        const lastY = new Date(toISO).getFullYear();
        const lastM = new Date(toISO).getMonth() + 1;

        while (y < lastY || (y === lastY && m <= lastM)) {
            const k = `${y}-${m}`;
            filled.push(map.get(k) ?? { year: y, month: m, income: 0, expense: 0, tx: 0 });
            m++; if (m > 12) { m = 1; y++; }
        }
        return filled;
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
