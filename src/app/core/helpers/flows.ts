import { ITransaction } from '@core/interfaces';

/**
 * What a transaction really is, for the honest totals.
 *
 *   spend    — money that left you
 *   income   — money that came to you
 *   refund   — a purchase coming back; it reduces spending, it is not income
 *   internal — money that only changed pockets: own jars, own cards, deposits,
 *              round-ups, your own accounts in other banks
 *
 * Built from the user's real statement wording. The one subtle case: "Поповнення «X»"
 * reads the same for your own jar and for someone else's fundraiser. Only your own
 * jar can be withdrawn from or rounded into, so the server sends that list
 * (`ownJars`) and anything outside it is a real donation.
 */
export type Flow = 'spend' | 'income' | 'refund' | 'internal';

export interface FlowContext {
    /** Lower-cased titles of your own jars. */
    ownJars: ReadonlySet<string>;
    /** Lower-cased surname spellings (Cyrillic + Latin). */
    surnames: readonly string[];
    /** Lower-cased first-name spellings, plus single-letter initials. */
    firstNames: readonly string[];
    initials: readonly string[];
}

export const EMPTY_FLOW_CONTEXT: FlowContext = { ownJars: new Set(), surnames: [], firstNames: [], initials: [] };

const JAR_OP = /^(Регулярне поповнення|Поповнення|Часткове зняття банки|Виплата банки|Округлення балансу|Зняття з банки|Закриття банки)\s*«([^»]*)»/i;
/** You can only take money out of, round into, or close your OWN jar. */
const JAR_OWNERSHIP_PROOF = /^(Часткове зняття банки|Виплата банки|Округлення балансу|Зняття з банки|Закриття банки)/i;
const OWN_CARD = /^(з|на)\s+(біл|чорн|долар|євро|єврово|гривн|злот|фіолет|платин|залізн)\S*\s+картк/i;
const DEPOSIT = /^(Поповнення депозиту|Виплата депозиту|Відкриття депозиту|Закриття депозиту|Дострокове закриття депозиту)/i;
const LOAN_IN = /^Розстрочка на картку/i;
// `\b` is ASCII-only in JS regexes — it never fires next to Cyrillic — so word ends
// are checked with \p{L} under the `u` flag.
const CASH_DESK = /^Каса(?!\p{L})/iu;
const ROUND_UP = /^Reserve$/i;
const REFUND = /^(Скасування|Повернення)(?!\p{L})/iu;
const BUSINESS = /(?<!\p{L})(ФОП|FOP)(?!\p{L})/iu;
const CHARITY_MCC = new Set([8398, 8661, 8641]);

const TRANSLIT: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z', и: 'y', і: 'i', ї: 'i',
    й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh',
    ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ю: 'iu', я: 'ia', ъ: '', ы: 'y', э: 'e', ё: 'e', "'": '', '’': '',
};

function translit(word: string): string {
    return Array.from(word.toLocaleLowerCase()).map(ch => TRANSLIT[ch] ?? ch).join('');
}

/** Build the context once per profile: "Шкарупа Даніїл" + own jar titles. */
export function buildFlowContext(clientName: string | undefined, ownJars: readonly string[] | undefined): FlowContext {
    const words = (clientName ?? '').trim().split(/\s+/).filter(w => w.length > 1);
    const [surname, firstName] = words;
    const spell = (w?: string) => (w ? Array.from(new Set([w.toLocaleLowerCase(), translit(w)])) : []);
    return {
        ownJars: new Set((ownJars ?? []).map(t => t.trim().toLocaleLowerCase()).filter(Boolean)),
        surnames: spell(surname),
        firstNames: spell(firstName),
        initials: firstName
            ? Array.from(new Set([firstName[0].toLocaleLowerCase(), translit(firstName[0])]))
            : [],
    };
}

/**
 * Your own name on the other side — your account in another bank. Surname alone is
 * not enough (family shares it), so the first name or its initial must be there too.
 */
function isOwnName(text: string, ctx: FlowContext): boolean {
    if (!ctx.surnames.length) return false;
    const lower = text.toLocaleLowerCase();
    if (!ctx.surnames.some(s => lower.includes(s))) return false;
    if (ctx.firstNames.some(f => lower.includes(f))) return true;
    return ctx.initials.some(i => new RegExp(`(^|[\\s.])${i}\\.`, 'u').test(lower));
}

/** Why a row is your own money changing pockets — the details page says it in words. */
export type InternalKind =
    | 'own-transfer' | 'own-card' | 'own-jar' | 'round-up' | 'deposit' | 'installment-credit' | 'cash-in' | 'own-name';

/** Which kind of own-money move a row is, or null when it is real spending or income. */
export function internalKind(tx: ITransaction, ctx: FlowContext = EMPTY_FLOW_CONTEXT): InternalKind | null {
    if (tx.ownTransfer) return 'own-transfer';

    const description = (tx.description ?? '').trim();
    const amount = Number(tx.amount) || 0;

    const jar = JAR_OP.exec(description);
    if (jar) {
        if (JAR_OWNERSHIP_PROOF.test(jar[1])) return 'own-jar';
        if (CHARITY_MCC.has(tx.mcc)) return null;
        return ctx.ownJars.has(jar[2].trim().toLocaleLowerCase()) ? 'own-jar' : null;
    }

    if (ROUND_UP.test(description)) return 'round-up';
    if (OWN_CARD.test(description)) return 'own-card';
    if (DEPOSIT.test(description)) return 'deposit';
    if (LOAN_IN.test(description) && amount > 0) return 'installment-credit';
    if (CASH_DESK.test(description) && amount > 0) return 'cash-in';

    const party = `${description} ${tx.counterName ?? ''}`;
    if (!BUSINESS.test(party) && isOwnName(party, ctx)) return 'own-name';
    return null;
}

export function flowOf(tx: ITransaction, ctx: FlowContext = EMPTY_FLOW_CONTEXT): Flow {
    if (internalKind(tx, ctx)) return 'internal';
    if (isRefund(tx)) return 'refund';
    return (Number(tx.amount) || 0) < 0 ? 'spend' : 'income';
}

/** Money coming back by its wording: «Скасування. Glovo». */
function isRefund(tx: ITransaction): boolean {
    return (Number(tx.amount) || 0) > 0 && REFUND.test((tx.description ?? '').trim());
}

/** What a refund puts in front of the merchant's own name. */
const REFUND_PREFIX = /^(?:Скасування|Повернення)(?!\p{L})[\s.:,;–—-]*/iu;

/**
 * Who a row is with, for adding up one merchant: the description, except that a
 * refund belongs to the merchant it came back from — «Скасування. Glovo» is Glovo's.
 * Matched on the description alone, a merchant's month counted every cancelled
 * order as spent while its refunds sat under a name of their own.
 */
export function partyLabel(tx: ITransaction): string {
    const label = (tx.description ?? '').trim();
    if (!isRefund(tx)) return label;
    return label.replace(REFUND_PREFIX, '').trim() || label;
}

/** A refund this much later than a charge is not taken as cancelling it. */
export const CANCEL_WINDOW_SEC = 45 * 86400;

/**
 * Orders the merchant cancelled. Monobank leaves the charge in the statement and
 * books «Скасування. X» for the same amount beside it, so a month with seven
 * cancelled Glovo orders lists 21 charges where 14 were real.
 *
 * Each refund takes the latest earlier charge with the same party, card and exact
 * amount that no other refund took, within CANCEL_WINDOW_SEC. The result maps both
 * ways — a charge to its refund and the refund to its charge; a pair adds up to
 * zero, so neither is an operation that really happened. A refund that matches no
 * charge (a partial one, or an order older than the rows given) cancels nothing
 * and stays a refund that reduces spending.
 *
 * `card` tells rows of different cards apart when the list mixes them.
 */
export function cancellationPairs<T>(
    rows: readonly T[],
    txOf: (row: T) => ITransaction,
    card: (row: T) => string = () => '',
): ReadonlyMap<string, ITransaction> {
    const charges = new Map<string, ITransaction[]>();
    const refunds: Array<{ tx: ITransaction; key: string }> = [];
    for (const row of rows) {
        const tx = txOf(row);
        const amount = Number(tx.amount) || 0;
        if (!amount) continue;
        // a purchase abroad comes back in its own currency; the hryvnia figure may not match
        const same = Number(tx.operationAmount) || amount;
        const key = `${card(row)}|${partyLabel(tx).toLocaleLowerCase()}|${tx.currencyCode ?? ''}|${Math.abs(same)}`;
        if (isRefund(tx)) refunds.push({ tx, key });
        else if (amount < 0) {
            const list = charges.get(key);
            if (list) list.push(tx);
            else charges.set(key, [tx]);
        }
    }

    const pairs = new Map<string, ITransaction>();
    if (!refunds.length) return pairs;
    for (const list of charges.values()) list.sort((a, b) => a.time - b.time);
    refunds.sort((a, b) => a.tx.time - b.tx.time);

    for (const { tx: refund, key } of refunds) {
        const list = charges.get(key);
        if (!list) continue;
        for (let i = list.length - 1; i >= 0; i--) {
            const charge = list[i];
            if (charge.time > refund.time) continue;
            if (refund.time - charge.time > CANCEL_WINDOW_SEC) break;
            list.splice(i, 1);
            pairs.set(charge.id, refund);
            pairs.set(refund.id, charge);
            break;
        }
    }
    return pairs;
}

/**
 * Monobank's automatic round-up into a jar — dozens of 3–7 ₴ debits a month that say
 * nothing on their own. The ledger folds them into one line per day.
 */
export function isRoundUp(tx: ITransaction): boolean {
    const description = (tx.description ?? '').trim();
    return ROUND_UP.test(description) || /^Округлення балансу/i.test(description);
}

/** Which jar a round-up went to ("Reserve" when the statement does not say). */
export function roundUpJar(tx: ITransaction): string {
    return /«([^»]*)»/.exec(tx.description ?? '')?.[1]?.trim() || 'Reserve';
}

/**
 * A hold that is still worth flagging as pending. Monobank never clears the flag on
 * many charged operations, so after a week "hold" says nothing — by then the money
 * has been taken (the balance chain shows it) and the row is an ordinary charge.
 */
export const PENDING_HOLD_SEC = 7 * 86400;

export function isPendingHold(tx: ITransaction, nowSec = Date.now() / 1000): boolean {
    return !!tx.hold && nowSec - tx.time < PENDING_HOLD_SEC;
}

export type CountMode = 'real' | 'all';

export interface FlowTotals {
    spent: number;
    income: number;
    refunds: number;
    internalOut: number;
    internalIn: number;
}

/**
 * Period totals. 'real' leaves internal moves out and nets refunds against
 * spending; 'all' is the raw statement — every debit spent, every credit earned.
 * `skip` lets a category marked "not counted" drop out as well.
 */
export function flowTotals(
    transactions: readonly ITransaction[],
    ctx: FlowContext,
    mode: CountMode,
    skip: (tx: ITransaction) => boolean = () => false,
): FlowTotals {
    const totals: FlowTotals = { spent: 0, income: 0, refunds: 0, internalOut: 0, internalIn: 0 };
    for (const tx of transactions ?? []) {
        const amount = Number(tx.amount) || 0;
        if (mode === 'all') {
            if (amount < 0) totals.spent += -amount;
            else totals.income += amount;
            continue;
        }
        const flow = flowOf(tx, ctx);
        if (flow === 'internal' || skip(tx)) {
            if (amount < 0) totals.internalOut += -amount;
            else totals.internalIn += amount;
        } else if (flow === 'refund') {
            totals.refunds += amount;
        } else if (flow === 'spend') {
            totals.spent += -amount;
        } else {
            totals.income += amount;
        }
    }
    totals.spent = Math.max(0, totals.spent - totals.refunds);
    return totals;
}
