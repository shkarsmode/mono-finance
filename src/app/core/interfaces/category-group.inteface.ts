import { ITransaction } from './transation.interface';

export interface ICategoryGroup {
    emoji: string;
    title: string;
    /**
     * Match rules. A purely numeric key is an MCC code; anything else matches
     * when the description, merchant or counterparty CONTAINS it.
     */
    keys: string[];
    /** Transactions pinned to this category by id. A pin beats every key. */
    txIds?: string[];
    /**
     * YOUR rules on an automatic category («ФОП Красний» → Дім). Text the
     * description, merchant or counterparty contains; they beat every built-in
     * rule, and only a pinned transaction beats them.
     */
    rules?: string[];
    /**
     * Money moving between your own pockets — jars, own cards, top-ups. Still
     * shown, but left out of Spent and Income so those figures stay honest.
     */
    excluded?: boolean;
    /** Only credits ('in') or only debits ('out'); both when absent. */
    direction?: 'in' | 'out';

    // ── Built-in (automatic) categories only. Never persisted. ──
    /** A rule that is code, not text — e.g. "this is your own money moving". */
    test?: (tx: ITransaction) => boolean;
    /** One line on what the category holds, shown in the categories overview. */
    note?: string;

    /** What each of your rules is for, shown next to it: «оренда», «паркінг». */
    ruleNotes?: Record<string, string>;

    // ── Derived for the current period. Never persisted. ──
    /** Net of every transaction that resolves to this category. */
    amount: number;
    spent?: number;
    income?: number;
    count?: number;
}

/**
 * What is stored on the user record: your additions to ONE automatic category.
 * The automatic categories themselves are code; only these are data.
 */
export interface IPersonalRules {
    kind: 'rules';
    /** The automatic category the rules point to. */
    title: string;
    /** Text the description, merchant or counterparty contains. */
    keys: string[];
    /** Single transactions moved here by hand. */
    txIds?: string[];
    /** What a rule is for: «оренда», «паркінг». */
    notes?: Record<string, string>;
}
