import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { partyLabel } from '@core/helpers/flows';
import { silent } from '@core/interceptors/silent-errors';
import { IAccount, ITransaction } from '@core/interfaces';
import { BASE_PATH_API } from '@core/tokens/monobank-environment.tokens';
import { first } from 'rxjs';

/** How far back a counterparty page reaches: 24 full months plus the running one. */
export const COUNTERPARTY_MONTHS = 24;

/** Older than this, a cached card is still shown at once and refreshed behind it. */
const STALE_MS = 5 * 60 * 1000;

/** One history row, with the card it happened on. */
export interface CounterpartyRow {
    readonly tx: ITransaction;
    readonly accountId: string;
    /** The card's currency — `tx.amount` is in its minor units. */
    readonly currencyCode: number;
    /** `counterpartyKey` of the row's party (a refund is its merchant's), worked out once per fetch. */
    readonly key: string;
}

interface AccountHistory {
    readonly currencyCode: number;
    readonly rows: readonly CounterpartyRow[];
    readonly fetchedAt: number;
}

/**
 * The form two labels are compared in: trimmed, single-spaced, one kind of
 * apostrophe, lower case. Monobank's «Від:» (money that came IN) is kept — the
 * matcher needs to know the direction a name was written for.
 */
export function counterpartyKey(label: string | null | undefined): string {
    return (label ?? '')
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/[ʼ'`‘]/g, '’')
        .toLocaleLowerCase();
}

/** Monobank's «Від: …» on money that came in; checked on a `counterpartyKey`. */
const INCOMING = /^від: ?/u;

/** A key without the direction: «від: олена а.» and «олена а.» are one party seen from both sides. */
export function counterpartyBase(key: string): string {
    return key.replace(INCOMING, '');
}

/** The party's name for a heading: the query without the direction prefix. */
export function counterpartyTitle(query: string | null | undefined): string {
    return (query ?? '').trim().replace(/^від:\s*/iu, '');
}

/** A masked card number on its own: «414960******3701» → head «414960», tail «3701». */
const CARD = /^(\d*)\*+(\d{4})$/;
/** …or at the very end of a longer label. */
const ENDS_IN_CARD = /(\d*)\*+(\d{4})$/;
/** How Monobank names a person you paid: «олександр м.» — first name and the surname's initial. */
const PERSON_SHORT = /^(\p{L}[\p{L}’-]*) (\p{L})\.$/u;
/** …and the same person paying you: «від: олександр мельник». */
const PERSON_FULL = /^(\p{L}[\p{L}’-]*) (\p{L}[\p{L}’-]+)$/u;

/**
 * Which rows belong to the party behind `query` (the details page's label — the
 * description, trimmed). Returns a predicate over `counterpartyKey` values.
 *
 *   · the same label, ignoring case, spacing and the «Від:» prefix;
 *   · a masked card number by its last four digits — Monobank writes one card as
 *     «414960****3701» and «414960******3701» — while the visible leading digits
 *     must not contradict each other (one may be shorter or absent), so another
 *     bank's card with the same last four stays out;
 *   · a person across both directions: money TO them reads «Олександр М.», money
 *     FROM them «Від: Олександр Мельник». The short form takes incoming rows with
 *     the same first name and a surname on that initial; a full «Від: …» query
 *     takes outgoing rows written the short way. Two people who share a first name
 *     and an initial are one label in Monobank already; the page lists every
 *     spelling it merged.
 */
export function counterpartyMatcher(query: string | null | undefined): (key: string) => boolean {
    const full = counterpartyKey(query);
    const wanted = counterpartyBase(full);
    if (!wanted) return () => false;

    const card = CARD.exec(wanted);
    const short = PERSON_SHORT.exec(wanted);
    // a full name only counts as a person when the query itself was money from them
    const named = full !== wanted ? PERSON_FULL.exec(wanted) : null;

    return key => {
        const base = counterpartyBase(key);
        if (base === wanted) return true;
        const incoming = base !== key;

        if (card) {
            const other = ENDS_IN_CARD.exec(base);
            return !!other && other[2] === card[2] && (other[1].startsWith(card[1]) || card[1].startsWith(other[1]));
        }
        if (short) {
            const other = incoming ? PERSON_FULL.exec(base) : null;
            return !!other && other[1] === short[1] && other[2].startsWith(short[2]);
        }
        if (named) {
            const other = incoming ? null : PERSON_SHORT.exec(base);
            return !!other && other[1] === named[1] && named[2].startsWith(other[2]);
        }
        return false;
    };
}

/**
 * The last two years of EVERY card, fetched in parallel and kept for the session,
 * so opening a second counterparty — or coming back to the first — is instant.
 * The rows are as the history endpoint sends them; matching, own-money filtering
 * and currency conversion are the page's business.
 */
@Injectable({ providedIn: 'root' })
export class CounterpartyHistoryService {
    private readonly http = inject(HttpClient);
    private readonly basePathApi = inject(BASE_PATH_API);

    private readonly histories = signal<ReadonlyMap<string, AccountHistory>>(new Map());
    private readonly pending = signal<ReadonlySet<string>>(new Set());
    /** Cards whose history could not be fetched and that have nothing cached. */
    private readonly failed = signal<ReadonlySet<string>>(new Set());
    /** The cards the page asked for, in client-info order. */
    private readonly wanted = signal<readonly string[]>([]);

    /** A request is out — the first load, or a refresh behind cached rows. */
    public readonly loading = computed(() => this.wanted().some(id => this.pending().has(id)));

    /** Every card has answered at least once, with rows or with an error. */
    public readonly settled = computed(() =>
        this.wanted().every(id => this.histories().has(id) || this.failed().has(id)),
    );

    /** At least one card has rows to show. */
    public readonly hasData = computed(() => this.wanted().some(id => this.histories().has(id)));

    public readonly failedIds = computed(() => this.wanted().filter(id => this.failed().has(id)));

    /** Every row of every wanted card, each id once. */
    public readonly rows = computed<CounterpartyRow[]>(() => {
        const histories = this.histories();
        const seen = new Set<string>();
        const out: CounterpartyRow[] = [];
        for (const id of this.wanted()) {
            for (const row of histories.get(id)?.rows ?? []) {
                if (seen.has(row.tx.id)) continue;
                seen.add(row.tx.id);
                out.push(row);
            }
        }
        return out;
    });

    /**
     * Load what is missing or stale for these cards. Cached cards stay on screen
     * while they refresh; a card that failed is simply asked again.
     */
    public ensure(accounts: readonly IAccount[]): void {
        const list = accounts.filter(account => !!account?.id);
        const ids = list.map(account => account.id);
        const current = this.wanted();
        if (ids.length !== current.length || ids.some((id, i) => id !== current[i])) this.wanted.set(ids);

        const now = Date.now();
        for (const account of list) {
            if (this.pending().has(account.id)) continue;
            const cached = this.histories().get(account.id);
            if (cached && now - cached.fetchedAt < STALE_MS) continue;
            this.fetch(account);
        }
    }

    private fetch(account: IAccount): void {
        const id = account.id;
        this.pending.update(set => new Set(set).add(id));
        this.failed.update(set => without(set, id));

        const tz = -new Date().getTimezoneOffset();
        this.http
            .get<{ cardCurrencyCode: number; rows: ITransaction[] }>(
                `${this.basePathApi}/transaction/history/${encodeURIComponent(id)}?months=${COUNTERPARTY_MONTHS}&tz=${tz}`,
                { context: silent() },   // the page shows its own error state
            )
            .pipe(first())
            .subscribe({
                next: response => {
                    // client-info knows the card's currency even when the server has no record of it yet
                    const currencyCode = account.currencyCode || response?.cardCurrencyCode || 980;
                    const rows = (response?.rows ?? [])
                        .filter(tx => !!tx?.id)
                        .map(tx => ({ tx, accountId: id, currencyCode, key: counterpartyKey(partyLabel(tx)) }));
                    this.histories.update(map => new Map(map).set(id, { currencyCode, rows, fetchedAt: Date.now() }));
                    this.pending.update(set => without(set, id));
                },
                error: () => {
                    // a failed refresh keeps the rows already on screen
                    if (!this.histories().has(id)) this.failed.update(set => new Set(set).add(id));
                    this.pending.update(set => without(set, id));
                },
            });
    }
}

function without(set: ReadonlySet<string>, id: string): ReadonlySet<string> {
    if (!set.has(id)) return set;
    const next = new Set(set);
    next.delete(id);
    return next;
}
