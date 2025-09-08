
import { HttpClient, HttpParams } from '@angular/common/http';
import { Inject, inject, Injectable, signal } from '@angular/core';
import { BASE_PATH_API } from '@core/tokens/monobank-environment.tokens';
import { Observable } from 'rxjs';

export interface MccRow {
    mcc: number;
    txCount: number;
    totalSpent: number;
    totalIncome: number;
    net: number;
    avgAbs: number;
    topMerchants: { name: string; total: number }[];
}
export interface MccResponse {
    params: { from?: string; to?: string; mccs?: number[] };
    totals: { totalSpent: number; totalIncome: number; net: number; txCount: number };
    rows: MccRow[];
}

export interface MonthlyPoint {
    year: number;     // 2024
    month: number;    // 1..12
    income: number;   // сумма входящих
    expense: number;  // сумма исходящих (≤0)
    tx: number;       // кол-во транзакций
}

export type TrendTarget =
  | { kind: 'mcc'; key: number }             // конкретный MCC
  | { kind: 'merchant'; key: string };       // конкретный мерчант

@Injectable({ providedIn: 'root' })
export class MccAnalyticsService {
    private http = inject(HttpClient);
    @Inject(BASE_PATH_API) private readonly baseUrl: string = 'https://finance-back.vercel.app/api'
    private tokenGetter = () => localStorage.getItem('token') || '';

    loading = signal(false);
    last = signal<MccResponse | null>(null);

    async fetch(from?: string, to?: string, mccCsv?: string) {
        this.loading.set(true);
        try {
            let params = new HttpParams();
            if (from) params = params.set('from', from);
            if (to) params = params.set('to', to);
            if (mccCsv) params = params.set('mcc', mccCsv);

            const res = await this.http.get<MccResponse>(
                `${this.baseUrl}/analytics/mcc-table`,
                {
                    params,
                    headers: { Authorization: `Bearer ${this.tokenGetter()}` },
                }
            ).toPromise();
            if (res) this.last.set(res);
            return res;
        } finally {
            this.loading.set(false);
        }
    }
    getMonthlyTrendCompat(fromISO: string, toISO: string, target: TrendTarget): Observable<MonthlyPoint[]> {
        const months = this.enumerateMonths(fromISO, toISO); // [{y,m,fromISO,toISO}, ...] по порядку
        return new Observable<MonthlyPoint[]>(subscriber => {
            const out: MonthlyPoint[] = [];
            const next = async () => {
                for (const it of months) {
                    try {
                        const params: any = { from: it.fromISO, to: it.toISO };
                        if (target.kind === 'mcc') params.mcc = String(target.key);
                        else params.merchant = String(target.key);

                        const row: any = await this.http.get(`${this.baseUrl}/analytics/mcc-table`, { params }).toPromise();

                        console.log(Number(row?.totals?.totalIncome ?? 0))
                        console.log(Number(row?.totals?.totalSpent ?? 0));
                        const income = 0;
                        const expense = Number(row?.totals?.totalIncome ?? 0) + Number(row?.totals?.totalSpent ?? 0);
                        const tx = Number(row?.totals?.txCount ?? 0);

                        out.push({ year: it.y, month: it.m, income, expense, tx });
                    } catch (e: any) {
                        if (e?.status === 429) {
                            const h = Number(e.headers?.get?.('Retry-After'));
                            const wait = Number.isFinite(h) && h > 0 ? h : 60;
                            await new Promise(res => setTimeout(res, wait * 1000));
                            continue;
                        } else {
                            throw e;
                        }
                    }
                }
                subscriber.next(out);
                subscriber.complete();
            };
            next();
        });
    }
    private enumerateMonths(fromISO: string, toISO: string): { y: number; m: number; fromISO: string; toISO: string }[] {
        const from = new Date(fromISO);
        const to = new Date(toISO);
        const res = [];
        let y = from.getFullYear(), m = from.getMonth() + 1;
        while (y < to.getFullYear() || (y === to.getFullYear() && m <= (to.getMonth() + 1))) {
            const monthStart = new Date(y, m - 1, 1);
            const monthEnd = new Date(y, m - 1, this.lastDayOfMonth(y, m));
            const fromStr = monthStart.toISOString().slice(0, 10);
            const toStr = monthEnd.toISOString().slice(0, 10);
            res.push({ y, m, fromISO: fromStr, toISO: toStr });
            m++; if (m > 12) { m = 1; y++; }
        }
        return res;
    }

    lastDayOfMonth(year:number, month:number): number {
        return new Date(year, month, 0).getDate(); // month — 1..12
    }
}
