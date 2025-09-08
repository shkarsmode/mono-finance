// mcc-analytics.service.ts
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
  year: number;      // 2025
  month: number;     // 1..12
  income: number;    // положительное число (абсолют)
  expense: number;   // положительное число (абсолют)
  tx: number;
}

export type TrendTarget =
  | { kind: 'mcc'; key: number }
  | { kind: 'merchant'; key: string };

export interface TrendProgress {
  points: MonthlyPoint[];
  current: number;         // обработано месяцев
  total: number;           // всего месяцев
  percent: number;         // 0..100
  month?: { y: number; m: number };
  done: boolean;
}

@Injectable({ providedIn: 'root' })
export class MccAnalyticsService {
  private http = inject(HttpClient);
  @Inject(BASE_PATH_API) private readonly baseUrl: string = 'https://finance-back.vercel.app/api';
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
        { params, headers: { Authorization: `Bearer ${this.tokenGetter()}` } }
      ).toPromise();

      if (res) this.last.set(res);
      return res;
    } finally {
      this.loading.set(false);
    }
  }

  /** Прогрессивная загрузка тренда: эмитит прогресс после каждого месяца. */
  getMonthlyTrendProgress(fromISO: string, toISO: string, target: TrendTarget): Observable<TrendProgress> {
    const months = this.enumerateMonths(fromISO, toISO);
    const total = months.length;

    return new Observable<TrendProgress>(subscriber => {
      const points: MonthlyPoint[] = [];
      let cancelled = false;

      const run = async () => {
        for (let i = 0; i < months.length; i++) {
          if (cancelled) return; // завершение без ошибок

          const it = months[i];

          // повторы при 429 для конкретного месяца
          let point: MonthlyPoint | null = null;
          let attempts = 0;
          while (!point) {
            try {
              const params: any = { from: it.fromISO, to: it.toISO };
              if (target.kind === 'mcc') params.mcc = String(target.key);
              else params.merchant = String(target.key);

              const row = await this.http.get<MccResponse>(
                `${this.baseUrl}/analytics/mcc-table`,
                { params, headers: { Authorization: `Bearer ${this.tokenGetter()}` } }
              ).toPromise();

              const incomeAbs  = Math.abs(Number(row?.totals?.totalIncome ?? 0));
              const spentAbs   = Math.abs(Number(row?.totals?.totalSpent ?? 0));
              const tx         = Number(row?.totals?.txCount ?? 0);

              point = { year: it.y, month: it.m, income: incomeAbs, expense: spentAbs, tx };
            } catch (e: any) {
              const tooMany = e?.status === 429 || String(e?.message ?? '').toLowerCase().includes('too many');
              if (tooMany) {
                attempts++;
                const retryAfterHeader = Number(e?.headers?.get?.('Retry-After'));
                const waitSec = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0 ? retryAfterHeader : 60;
                await new Promise(res => setTimeout(res, waitSec * 1000));
                if (attempts <= 5) continue;
              }
              // любая другая ошибка — заполняем нулями и идём дальше
              point = { year: it.y, month: it.m, income: 0, expense: 0, tx: 0 };
            }
          }

          points.push(point);
          const percent = Math.round(((i + 1) / total) * 100);

          subscriber.next({
            points: [...points],   // копия, чтобы change detection сработал
            current: i + 1,
            total,
            percent,
            month: { y: it.y, m: it.m },
            done: i + 1 === total
          });
        }
        subscriber.complete();
      };

      run();

      // отмена (закрытие)
      return () => { cancelled = true; };
    });
  }

  private enumerateMonths(fromISO: string, toISO: string): { y: number; m: number; fromISO: string; toISO: string }[] {
    const from = new Date(fromISO);
    const to = new Date(toISO);
    const res: { y: number; m: number; fromISO: string; toISO: string }[] = [];

    let y = from.getFullYear();
    let m = from.getMonth() + 1;
    while (y < to.getFullYear() || (y === to.getFullYear() && m <= (to.getMonth() + 1))) {
      const monthStart = new Date(y, m - 1, 1);
      const monthEnd = new Date(y, m); // последний день
      const fromStr = monthStart.toISOString().slice(0, 10);
      const toStr   = monthEnd.toISOString().slice(0, 10);
      res.push({ y, m, fromISO: fromStr, toISO: toStr });
      m++; if (m > 12) { m = 1; y++; }
    }
    return res;
  }
}
