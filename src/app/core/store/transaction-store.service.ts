import { Injectable } from '@angular/core';
import { ITransaction } from '@core/interfaces';

type MonthKey = string; // `${cardId}:${year}-${month}`

interface MonthBlob {
    key: MonthKey;
    cardId: string;
    year: number;
    month: number;
    rows: ITransaction[];
    syncedAt: number; // epoch ms of the last write
}

/**
 * Local transaction cache backed by IndexedDB with an in-memory mirror.
 *
 * The mirror makes reads synchronous: selecting a month paints instantly from
 * whatever is cached, and a background fetch revalidates. Nothing is ever an
 * empty screen when the store has rows for that month.
 */
@Injectable({ providedIn: 'root' })
export class TransactionStore {
    private static readonly DB_NAME = 'finance-cache';
    private static readonly STORE = 'months';

    private db: IDBDatabase | null = null;
    private readonly mirror = new Map<MonthKey, MonthBlob>();
    private ready: Promise<void> | null = null;

    /** Open the DB and hydrate the in-memory mirror once. Safe to call repeatedly. */
    public init(): Promise<void> {
        if (this.ready) {
            return this.ready;
        }
        this.ready = new Promise<void>((resolve) => {
            if (typeof indexedDB === 'undefined') {
                resolve();
                return;
            }
            const request = indexedDB.open(TransactionStore.DB_NAME, 1);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(TransactionStore.STORE)) {
                    db.createObjectStore(TransactionStore.STORE, { keyPath: 'key' });
                }
            };
            request.onsuccess = () => {
                this.db = request.result;
                this.hydrate().then(resolve).catch(() => resolve());
            };
            request.onerror = () => resolve(); // Degrade gracefully to no cache.
        });
        return this.ready;
    }

    /** Synchronous read from the mirror. Returns null when the month is uncached. */
    public readMonth(cardId: string, year: number, month: number, includeHold = false): ITransaction[] | null {
        const blob = this.mirror.get(this.key(cardId, year, month, includeHold));
        return blob ? blob.rows : null;
    }

    public monthMeta(cardId: string, year: number, month: number, includeHold = false): { syncedAt: number; count: number } | null {
        const blob = this.mirror.get(this.key(cardId, year, month, includeHold));
        return blob ? { syncedAt: blob.syncedAt, count: blob.rows.length } : null;
    }

    /** Replace a month slice (server deletions must propagate, so this replaces, not merges). */
    public writeMonth(cardId: string, year: number, month: number, rows: ITransaction[], includeHold = false): void {
        const blob: MonthBlob = { key: this.key(cardId, year, month, includeHold), cardId, year, month, rows, syncedAt: Date.now() };
        this.mirror.set(blob.key, blob);
        this.persist(blob);
    }

    private async hydrate(): Promise<void> {
        if (!this.db) {
            return;
        }
        await new Promise<void>((resolve) => {
            const tx = this.db!.transaction(TransactionStore.STORE, 'readonly');
            const req = tx.objectStore(TransactionStore.STORE).getAll();
            req.onsuccess = () => {
                for (const blob of (req.result as MonthBlob[]) ?? []) {
                    this.mirror.set(blob.key, blob);
                }
                resolve();
            };
            req.onerror = () => resolve();
        });
    }

    private persist(blob: MonthBlob): void {
        if (!this.db) {
            return;
        }
        try {
            const tx = this.db.transaction(TransactionStore.STORE, 'readwrite');
            tx.objectStore(TransactionStore.STORE).put(blob);
        } catch {
            /* best-effort cache; ignore write failures */
        }
    }

    private key(cardId: string, year: number, month: number, includeHold: boolean): MonthKey {
        return `${cardId}:${year}-${month}${includeHold ? ':hold' : ''}`;
    }
}
