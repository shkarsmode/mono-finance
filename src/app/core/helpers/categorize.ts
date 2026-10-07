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
 *   2. YOUR rule (`rules`) — what you said about a merchant beats every built-in
 *      rule; the longest wins;
 *   3. a system rule (`test`) — e.g. "this is your own money moving";
 *   4. the LONGEST text key that the description, merchant or counterparty
 *      contains — "Дія | Штрафи" beats "Дія", whatever order the categories are in;
 *      equal lengths fall back to category order;
 *   5. the first category (in order) holding the transaction's MCC — a single code
 *      ("5411") or a range ("3000-3999");
 *   6. otherwise uncategorized.
 *
 * A category with a `direction` only takes credits ('in') or debits ('out'), so
 * "transfers in" and "transfers to people" can share MCC 4829.
 *
 * A text key starting with "^" matches only the START of the description —
 * "^Платіж" catches "Платіж FOXTROT" (an installment) without catching every
 * description that merely contains the word. Being anchored, these keys are more
 * specific than any plain key and are tried before them.
 */

export const UNCATEGORIZED = -1;

const MCC_KEY = /^\d{3,4}$/;
const MCC_RANGE = /^(\d{3,4})\s*-\s*(\d{3,4})$/;

type Direction = 'in' | 'out' | undefined;

interface Compiled {
    pinned: Map<string, number>;
    /** Your rules, longest first. */
    rules: Array<{ key: string; raw: string; index: number; dir: Direction; starts: boolean }>;
    tests: Array<{ test: (tx: ITransaction) => boolean; index: number; dir: Direction }>;
    /** Sorted longest-first, ties by category index. */
    text: Array<{ key: string; raw: string; index: number; dir: Direction; starts: boolean }>;
    /** In category order. */
    mcc: Array<{ codes: Set<number>; ranges: Array<[number, number]>; index: number; dir: Direction }>;
}

const compiledCache = new WeakMap<readonly ICategoryGroup[], Compiled>();

function compile(groups: readonly ICategoryGroup[]): Compiled {
    const cached = compiledCache.get(groups);
    if (cached) return cached;

    const pinned = new Map<string, number>();
    const rules: Compiled['rules'] = [];
    const tests: Compiled['tests'] = [];
    const text: Compiled['text'] = [];
    const mcc: Compiled['mcc'] = [];

    groups.forEach((group, index) => {
        const dir = group.direction;
        for (const id of group.txIds ?? []) {
            if (!pinned.has(id)) pinned.set(id, index);
        }
        for (const raw of group.rules ?? []) {
            const key = String(raw ?? '').trim();
            if (!key) continue;
            const starts = key.startsWith('^') && key.length > 1;
            rules.push({ key: (starts ? key.slice(1) : key).toLocaleLowerCase(), raw: key, index, dir: undefined, starts });
        }
        if (group.test) tests.push({ test: group.test, index, dir });

        const codes = new Set<number>();
        const ranges: Array<[number, number]> = [];
        for (const raw of group.keys ?? []) {
            const key = String(raw ?? '').trim();
            if (!key) continue;
            const range = MCC_RANGE.exec(key);
            if (range) ranges.push([Number(range[1]), Number(range[2])]);
            else if (MCC_KEY.test(key)) codes.add(Number(key));
            else if (key.startsWith('^') && key.length > 1) {
                text.push({ key: key.slice(1).toLocaleLowerCase(), raw: key, index, dir, starts: true });
            } else text.push({ key: key.toLocaleLowerCase(), raw: key, index, dir, starts: false });
        }
        if (codes.size || ranges.length) mcc.push({ codes, ranges, index, dir });
    });

    text.sort((a, b) => Number(b.starts) - Number(a.starts) || b.key.length - a.key.length || a.index - b.index);
    rules.sort((a, b) => b.key.length - a.key.length || a.index - b.index);

    const result = { pinned, rules, tests, text, mcc };
    compiledCache.set(groups, result);
    return result;
}

function haystack(tx: ITransaction): string[] {
    return [tx.description, tx.merchantName, tx.counterName]
        .map(value => (value ?? '').toLocaleLowerCase())
        .filter(Boolean);
}

function fits(dir: Direction, tx: ITransaction): boolean {
    if (!dir) return true;
    const amount = Number(tx.amount) || 0;
    return dir === 'in' ? amount > 0 : amount < 0;
}

/** fields[0] is the description — "^" keys look only at its start. */
function textHit(entry: Compiled['text'][number], fields: string[]): boolean {
    if (entry.starts) return (fields[0] ?? '').startsWith(entry.key);
    return fields.some(field => field.includes(entry.key));
}

function mccHit(entry: Compiled['mcc'][number], tx: ITransaction): boolean {
    for (const code of [tx.mcc, tx.originalMcc]) {
        if (!code) continue;
        if (entry.codes.has(code)) return true;
        if (entry.ranges.some(([from, to]) => code >= from && code <= to)) return true;
    }
    return false;
}

/** A key that is an MCC code ("5411") or an MCC range ("3000-3999"). */
export function isMccKey(key: string): boolean {
    const k = String(key ?? '').trim();
    return MCC_KEY.test(k) || MCC_RANGE.test(k);
}

export type MatchReason =
    | { by: 'pin' }
    | { by: 'rule'; key: string }
    | { by: 'system' }
    | { by: 'text'; key: string }
    | { by: 'mcc'; mcc: number }
    | { by: 'none' };

/** The winning category AND why it won — the ledger shows the reason on hover. */
export function explainCategory(tx: ITransaction, groups: readonly ICategoryGroup[]): { index: number; reason: MatchReason } {
    if (!groups?.length) return { index: UNCATEGORIZED, reason: { by: 'none' } };
    const compiled = compile(groups);

    const pin = compiled.pinned.get(tx.id);
    if (pin !== undefined) return { index: pin, reason: { by: 'pin' } };

    const fields = haystack(tx);
    for (const entry of compiled.rules) {
        if (textHit(entry, fields)) return { index: entry.index, reason: { by: 'rule', key: entry.raw } };
    }

    for (const { test, index, dir } of compiled.tests) {
        if (fits(dir, tx) && test(tx)) return { index, reason: { by: 'system' } };
    }

    for (const entry of compiled.text) {
        if (fits(entry.dir, tx) && textHit(entry, fields)) return { index: entry.index, reason: { by: 'text', key: entry.raw } };
    }

    for (const entry of compiled.mcc) {
        if (fits(entry.dir, tx) && mccHit(entry, tx)) return { index: entry.index, reason: { by: 'mcc', mcc: tx.mcc || tx.originalMcc } };
    }

    return { index: UNCATEGORIZED, reason: { by: 'none' } };
}

/** Index of the winning category, or UNCATEGORIZED. */
export function categoryIndexOf(tx: ITransaction, groups: readonly ICategoryGroup[]): number {
    return explainCategory(tx, groups).index;
}

/** Every category whose rules match — the winner plus any it beat. */
export function matchingIndexes(tx: ITransaction, groups: readonly ICategoryGroup[]): number[] {
    if (!groups?.length) return [];
    const compiled = compile(groups);
    const hits = new Set<number>();

    const pin = compiled.pinned.get(tx.id);
    if (pin !== undefined) hits.add(pin);

    const fields = haystack(tx);
    for (const entry of compiled.rules) {
        if (textHit(entry, fields)) hits.add(entry.index);
    }
    for (const { test, index, dir } of compiled.tests) {
        if (fits(dir, tx) && test(tx)) hits.add(index);
    }
    for (const entry of compiled.text) {
        if (fits(entry.dir, tx) && textHit(entry, fields)) hits.add(entry.index);
    }
    for (const entry of compiled.mcc) {
        if (fits(entry.dir, tx) && mccHit(entry, tx)) hits.add(entry.index);
    }
    return Array.from(hits);
}

/** The key "everything from this merchant" is written as. */
export function merchantLabel(tx: ITransaction): string {
    return (tx.description ?? '').trim();
}

/**
 * The text a rule "everything like this" is written as: the description, except
 * a transfer to a card number — Monobank writes the same card as «414960****3701»
 * and «414960******3701», so the rule keeps only «*3701».
 */
export function ruleKeyFor(tx: ITransaction): string {
    const description = merchantLabel(tx);
    const card = /^\d{4,6}\*+(\d{4})$/.exec(description);
    return card ? `*${card[1]}` : description;
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
        if (group.direction) definition.direction = group.direction;
        return definition;
    });
}
