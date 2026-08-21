import { HttpClient } from '@angular/common/http';
import { computed, inject, Inject, Injectable, signal } from '@angular/core';
import { BASE_PATH_API } from '@core/tokens/monobank-environment.tokens';
import { Observable } from 'rxjs';

export interface SyncCoverageCell {
    cardId: string;
    year: number;
    month: number;
    isComplete: boolean;
    txCount: number;
    apiItemCount: number;
    lastSyncedAt: number;
}

export interface SyncStatus {
    queue: {
        pending: number;
        running: number;
        done: number;
        failed: number;
        byPriority: { priority: number; pending: number }[];
        nextBackfill: { year: number; month: number; kind: string } | null;
    };
    lease: { statementWaitSec: number };
    accounts: Array<{
        accountId: string;
        kind: string;
        backfillState: 'idle' | 'running' | 'complete';
        syncedThroughSec: number | null;
        backfilledFromSec: number | null;
        emptyMonthStreak: number;
        lastError: string | null;
    }>;
    coverage: SyncCoverageCell[];
}

type MonthFreshness = 'fresh' | 'refreshing' | 'stale' | 'unknown';

/**
 * Polls GET /sync/status and exposes the server's sync state as signals so the UI
 * can show progress ambiently — a backfill capsule, a per-month freshness dot —
 * instead of blocking modals. Polls faster while a backfill is draining.
 */
@Injectable({ providedIn: 'root' })
export class SyncStatusService {
    private readonly http = inject(HttpClient);

    readonly status = signal<SyncStatus | null>(null);
    private timer: ReturnType<typeof setTimeout> | null = null;

    readonly pending = computed(() => this.status()?.queue.pending ?? 0);
    readonly done = computed(() => this.status()?.queue.done ?? 0);
    readonly isBackfilling = computed(() => {
        const s = this.status();
        if (!s) return false;
        return s.accounts.some(a => a.backfillState === 'running') || s.queue.pending > 0;
    });

    /** e.g. "Backfilling · 2021-04 · 63 done · 129 left" — for the topbar capsule. */
    readonly capsuleLabel = computed(() => {
        const s = this.status();
        if (!s || !this.isBackfilling()) return '';
        const next = s.queue.nextBackfill;
        const at = next ? `${next.year}-${String(next.month).padStart(2, '0')}` : '';
        const parts = ['Syncing'];
        if (at) parts.push(at);
        parts.push(`${s.queue.done} done`, `${s.queue.pending} left`);
        return parts.join(' · ');
    });

    readonly progressPercent = computed(() => {
        const s = this.status();
        if (!s) return 0;
        const total = s.queue.done + s.queue.pending + s.queue.running;
        return total > 0 ? Math.round((s.queue.done / total) * 100) : 0;
    });

    constructor(@Inject(BASE_PATH_API) private readonly basePathApi: string) {}

    /** Freshness of a specific month, from the coverage map. */
    monthFreshness(cardId: string, year: number, month: number): MonthFreshness {
        const s = this.status();
        if (!s) return 'unknown';
        const cell = s.coverage.find(c => c.cardId === cardId && c.year === year && c.month === month);
        if (!cell) return 'stale';
        return cell.isComplete ? 'fresh' : 'refreshing';
    }

    startBackfill(): Observable<{ accounts: number; jobs: number }> {
        return this.http.post<{ accounts: number; jobs: number }>(`${this.basePathApi}/sync/backfill`, {});
    }

    refreshOnce(): void {
        this.http.get<SyncStatus>(`${this.basePathApi}/sync/status`).subscribe({
            next: (status) => {
                this.status.set(status);
                this.scheduleNext();
            },
            error: () => this.scheduleNext(),
        });
    }

    /** Begin polling; idempotent. */
    start(): void {
        if (this.timer) return;
        this.refreshOnce();
    }

    stop(): void {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    private scheduleNext(): void {
        if (this.timer) {
            clearTimeout(this.timer);
        }
        // Poll quickly while work is draining, slowly when idle.
        const intervalMs = this.isBackfilling() ? 4000 : 20000;
        this.timer = setTimeout(() => this.refreshOnce(), intervalMs);
    }
}
