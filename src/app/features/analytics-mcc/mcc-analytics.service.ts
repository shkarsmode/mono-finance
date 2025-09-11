// mcc-analytics.service.ts
import { HttpClient, HttpEvent, HttpEventType, HttpParams } from '@angular/common/http';
import { Inject, inject, Injectable, signal } from '@angular/core';
import { BASE_PATH_API } from '@core/tokens/monobank-environment.tokens';
import { interval, Observable, Subject, Subscription } from 'rxjs';

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
    income: number;    // positive abs
    expense: number;   // positive abs
    tx: number;
}

export type TrendTarget =
    | { kind: 'mcc'; key: number }
    | { kind: 'merchant'; key: string };

export interface TrendProgressEvent {
    percent: number;          // 0..100
    etaMs?: number;           // осталось мс (оценка)
    points?: MonthlyPoint[];  // появится на финале
    done?: boolean;
}

/** Пер-эндпоинтовая EMA времён ответа для умного ETA. */
const trendEmaStore = new Map<string, number>(); // key -> ms

function updateEma(key: string, actualMs: number): void {
    const alpha = 0.3;
    const prev = trendEmaStore.get(key);
    trendEmaStore.set(key, prev == null ? actualMs : prev * (1 - alpha) + actualMs * alpha);
}

function readEma(key: string, fallbackMs: number): number {
    return trendEmaStore.get(key) ?? fallbackMs;
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

    getMonthlyTrendWithProgress(fromISO: string, toISO: string, target: TrendTarget): Observable<TrendProgressEvent> {
        const subject = new Subject<TrendProgressEvent>();

        const params = new HttpParams()
            .set('from', fromISO)
            .set('to', toISO)
            .set('kind', target.kind)
            .set('key', String(target.key));


        const headers = { Authorization: `Bearer ${this.tokenGetter()}` };

        const progressKey = `${target.kind}:${target.key}:${fromISO}:${toISO}`;
        const startTime = Date.now();

        // Таймер для time-based ETA, если server не шлёт total
        let timerSub: Subscription | undefined;
        let usedTimeBased = false;
        const expectedMsSeed = Math.max(1200, Math.min(1000 * 15, readEma(progressKey, 4000))); // 1.2s..15s
        let expectedMs = expectedMsSeed;

        const startTimeBased = () => {
            if (timerSub) return;
            usedTimeBased = true;
            timerSub = interval(100).subscribe(() => {
                const elapsed = Date.now() - startTime;
                const ratio = Math.min(0.95, elapsed / expectedMs);
                const percent = Math.max(5, Math.round(ratio * 100));
                const etaMs = Math.max(0, Math.round(expectedMs - elapsed));
                subject.next({ percent, etaMs });
            });
        };

        const stopTimeBased = () => {
            timerSub?.unsubscribe();
            timerSub = undefined;
        };

        const httpSub = this.http.request<MonthlyPoint[]>(
            'GET', `${this.baseUrl}/analytics/monthly-trend`, { headers, reportProgress: true, observe: 'events', params }
        )
            .subscribe({
                next: (event: HttpEvent<MonthlyPoint[]>) => {
                    if (event.type === HttpEventType.Sent) {
                        // Старт: запустим «мягкий» таймер заранее
                        console.log('start')
                        startTimeBased();
                        return;
                    }

                    if (event.type === HttpEventType.DownloadProgress) {
                        // Реальный прогресс, если есть total
                        console.log('event.total', event.total);
                        const total = (event.total ?? 0);
                        if (total > 0) {
                            const percent = Math.min(99, Math.max(1, Math.round((event.loaded / total) * 100)));
                            const elapsed = Date.now() - startTime;
                            // Грубая оценка на основе текущей скорости
                            const speed = event.loaded / Math.max(1, elapsed / 1000); // bytes per sec
                            const remaining = Math.max(0, total - event.loaded);
                            const etaMs = speed > 0 ? Math.round((remaining / speed) * 1000) : undefined;
                            // Перекрываем time-based, если есть real total
                            stopTimeBased();
                            subject.next({ percent, etaMs });
                        } else {
                            // Нет total — оставляем time-based
                            startTimeBased();
                        }
                        return;
                    }

                    if (event.type === HttpEventType.Response) {
                        stopTimeBased();
                        const durationMs = Date.now() - startTime;

                        // Апдейтим EMA, если мы были в time-based или просто хотим улучшить будущую оценку
                        updateEma(progressKey, durationMs);

                        const points = event.body || [];
                        subject.next({ percent: 100, etaMs: 0, points, done: true });
                        subject.complete();
                        return;
                    }
                },
                error: (err) => {
                    stopTimeBased();
                    subject.error(err);
                }
            });

        return new Observable<TrendProgressEvent>((observer) => {
            const sub = subject.subscribe(observer);
            return () => {
                sub.unsubscribe();
                httpSub.unsubscribe();
                stopTimeBased();
            };
        });
    }
}
