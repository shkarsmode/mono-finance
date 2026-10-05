
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
     * Money moving between your own pockets — jars, own cards, top-ups. Still
     * shown, but left out of Spent and Income so those figures stay honest.
     */
    excluded?: boolean;

    // ── Derived for the current period. Never persisted. ──
    /** Net of every transaction that resolves to this category. */
    amount: number;
    spent?: number;
    income?: number;
    count?: number;
}
