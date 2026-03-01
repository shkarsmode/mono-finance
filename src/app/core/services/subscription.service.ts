import { HttpClient } from '@angular/common/http';
import { Inject, Injectable, signal } from '@angular/core';
import { BASE_PATH_API } from '@core/tokens/monobank-environment.tokens';
import { Observable, tap } from 'rxjs';

export interface ISubscription {
    id: number;
    merchantKey: string;
    title: string;
    averageAmount: number;
    currency: number;
    cadence: 'monthly' | 'weekly' | 'unknown';
    lastSeenAt: string;
    nextExpectedAt: string | null;
    isActive: boolean;
    confidence: number;
    occurrenceCount: number;
    createdAt: string;
    updatedAt: string;
}

@Injectable({ providedIn: 'root' })
export class SubscriptionService {
    readonly subscriptions = signal<ISubscription[]>([]);
    readonly isLoading = signal(false);
    readonly isDetecting = signal(false);

    constructor(
        private readonly http: HttpClient,
        @Inject(BASE_PATH_API) private readonly basePathApi: string,
    ) {}

    loadAll(): Observable<ISubscription[]> {
        this.isLoading.set(true);
        return this.http.get<ISubscription[]>(`${this.basePathApi}/subscriptions`).pipe(
            tap(subs => {
                this.subscriptions.set(subs);
                this.isLoading.set(false);
            }),
        );
    }

    detect(): Observable<ISubscription[]> {
        this.isDetecting.set(true);
        return this.http.post<ISubscription[]>(`${this.basePathApi}/subscriptions/detect`, {}).pipe(
            tap(subs => {
                this.subscriptions.set(subs);
                this.isDetecting.set(false);
            }),
        );
    }

    toggleActive(id: number, isActive: boolean): Observable<ISubscription> {
        return this.http.patch<ISubscription>(
            `${this.basePathApi}/subscriptions/${id}`,
            { isActive },
        ).pipe(
            tap(updated => {
                this.subscriptions.update(list =>
                    list.map(s => s.id === updated.id ? updated : s)
                );
            }),
        );
    }
}
