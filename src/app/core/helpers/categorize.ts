import { ICategoryGroup, ITransaction } from '@core/interfaces';

/**
 * The one place that decides which category a transaction belongs to. The ledger,
 * the category totals, the dashboard breakdown and the category editor all ask
 * here, so they can never disagree — previously the ledger took the first match
 * while the totals added a transaction to EVERY category it matched, so a key like
 * "apteka" sitting in two categories counted the same purchase twice.
 *
 * Resolution, most specific first:
 *   1. a transaction pinned to a category by id;
 *   2. the LONGEST text key that the description, merchant or counterparty
 *      contains — "Дія | Штрафи" beats "Дія", whatever order the categories are in;
 *      equal lengths fall back to category order;
 *   3. the first category (in order) holding the transaction's MCC;
 *   4. otherwise uncategorized.
 */

export const UNCATEGORIZED = -1;

const MCC_KEY = /^\d+$/;

interface Compiled {
    pinned: Map<string, number>;
    /** Sorted longest-first, ties by category index. */
    text: Array<{ key: string; index: number }>;
    /** In category order. */
    mcc: Array<{ codes: Set<number>; index: number }>;
}

const compiledCache = new WeakMap<readonly ICategoryGroup[], Compiled>();

function compile(groups: readonly ICategoryGroup[]): Compiled {
    const cached = compiledCache.get(groups);
    if (cached) return cached;

    const pinned = new Map<string, number>();
    const text: Compiled['text'] = [];
    const mcc: Compiled['mcc'] = [];

    groups.forEach((group, index) => {
        for (const id of group.txIds ?? []) {
            if (!pinned.has(id)) pinned.set(id, index);
        }

        const codes = new Set<number>();
        for (const raw of group.keys ?? []) {
            const key = String(raw ?? '').trim();
            if (!key) continue;
            if (MCC_KEY.test(key)) codes.add(Number(key));
            else text.push({ key: key.toLocaleLowerCase(), index });
        }
        if (codes.size) mcc.push({ codes, index });
    });

    text.sort((a, b) => b.key.length - a.key.length || a.index - b.index);

    const result = { pinned, text, mcc };
    compiledCache.set(groups, result);
    return result;
}

function haystack(tx: ITransaction): string[] {
    return [tx.description, tx.merchantName, tx.counterName]
        .map(value => (value ?? '').toLocaleLowerCase())
        .filter(Boolean);
}

/** Index of the winning category, or UNCATEGORIZED. */
export function categoryIndexOf(tx: ITransaction, groups: readonly ICategoryGroup[]): number {
    if (!groups?.length) return UNCATEGORIZED;
    const compiled = compile(groups);

    const pin = compiled.pinned.get(tx.id);
    if (pin !== undefined) return pin;

    const fields = haystack(tx);
    for (const { key, index } of compiled.text) {
        if (fields.some(field => field.includes(key))) return index;
    }

    for (const { codes, index } of compiled.mcc) {
        if (codes.has(tx.mcc) || codes.has(tx.originalMcc)) return index;
    }

    return UNCATEGORIZED;
}

/** Every category whose rules match — the winner plus any it beat. */
export function matchingIndexes(tx: ITransaction, groups: readonly ICategoryGroup[]): number[] {
    if (!groups?.length) return [];
    const compiled = compile(groups);
    const hits = new Set<number>();

    const pin = compiled.pinned.get(tx.id);
    if (pin !== undefined) hits.add(pin);

    const fields = haystack(tx);
    for (const { key, index } of compiled.text) {
        if (fields.some(field => field.includes(key))) hits.add(index);
    }
    for (const { codes, index } of compiled.mcc) {
        if (codes.has(tx.mcc) || codes.has(tx.originalMcc)) hits.add(index);
    }
    return Array.from(hits);
}

/** The key "everything from this merchant" is written as. */
export function merchantLabel(tx: ITransaction): string {
    return (tx.description ?? '').trim();
}

/** False for transactions that resolve to an excluded (transfer) category. */
export function isCounted(tx: ITransaction, groups: readonly ICategoryGroup[]): boolean {
    const index = categoryIndexOf(tx, groups);
    return index === UNCATEGORIZED || !groups[index]?.excluded;
}

export interface CategoryTotals {
    spent: number;
    income: number;
    net: number;
    count: number;
    /** How many transactions make up `spent` and `income` respectively. */
    spentCount: number;
    incomeCount: number;
}

export interface Summary {
    byIndex: CategoryTotals[];
    uncategorized: CategoryTotals;
}

const empty = (): CategoryTotals => ({ spent: 0, income: 0, net: 0, count: 0, spentCount: 0, incomeCount: 0 });

/** One pass: each transaction lands in exactly one bucket. */
export function summarize(transactions: readonly ITransaction[], groups: readonly ICategoryGroup[]): Summary {
    const byIndex = groups.map(empty);
    const uncategorized = empty();

    for (const tx of transactions ?? []) {
        const amount = Number(tx.amount) || 0;
        const index = categoryIndexOf(tx, groups);
        const bucket = index === UNCATEGORIZED ? uncategorized : byIndex[index];
        bucket.count += 1;
        bucket.net += amount;
        if (amount < 0) {
            bucket.spent += -amount;
            bucket.spentCount += 1;
        } else if (amount > 0) {
            bucket.income += amount;
            bucket.incomeCount += 1;
        }
    }

    return { byIndex, uncategorized };
}

export type AssignMode = 'merchant' | 'single';

/**
 * Put a transaction into a category and return the NEW category list.
 *
 * 'merchant' writes the merchant as a key on the target and removes that exact key
 * from every other category, so "everything from Сільпо" moves together.
 * 'single' pins only this transaction.
 *
 * Either way the result is verified: if some other rule would still win, the
 * transaction is pinned as well, so an assignment always visibly takes effect.
 */
export function assignTransaction(
    groups: readonly ICategoryGroup[],
    tx: ITransaction,
    targetIndex: number,
    mode: AssignMode,
): ICategoryGroup[] {
    if (targetIndex < 0 || targetIndex >= groups.length) return [...groups];

    const key = merchantLabel(tx);
    const keyLower = key.toLocaleLowerCase();

    let next = groups.map((group, index) => {
        const txIds = (group.txIds ?? []).filter(id => id !== tx.id);
        let keys = [...(group.keys ?? [])];

        if (mode === 'merchant' && key) {
            keys = keys.filter(k => String(k).trim().toLocaleLowerCase() !== keyLower);
            if (index === targetIndex) keys.push(key);
        }
        if (mode === 'single' && index === targetIndex) txIds.push(tx.id);

        return { ...group, keys, txIds };
    });

    if (categoryIndexOf(tx, next) !== targetIndex) {
        next = next.map((group, index) =>
            index === targetIndex ? { ...group, txIds: [...(group.txIds ?? []), tx.id] } : group,
        );
    }

    return next.map(stripEmptyPins);
}

function stripEmptyPins(group: ICategoryGroup): ICategoryGroup {
    if (group.txIds && group.txIds.length === 0) {
        const { txIds, ...rest } = group;
        return rest as ICategoryGroup;
    }
    return group;
}

/** Shape stored on the server — definitions only, no derived totals. */
export function toDefinitions(groups: readonly ICategoryGroup[]): ICategoryGroup[] {
    return groups.map(group => {
        const definition: ICategoryGroup = {
            emoji: group.emoji ?? '',
            title: group.title,
            keys: [...(group.keys ?? [])],
            amount: 0,
        };
        if (group.txIds?.length) definition.txIds = [...group.txIds];
        if (group.excluded) definition.excluded = true;
        return definition;
    });
}

/**
 * Stable category colour, by position: --cat-1 … --cat-12. Uncategorized gets a
 * neutral of its own so it never shares a hue with the twelfth category.
 */
export function categoryColor(index: number): string {
    return index < 0 ? 'var(--ink-3)' : `var(--cat-${(index % 12) + 1})`;
}
