/**
 * Category titles the code reasons about, not only shows. One place, so renaming
 * one on screen can never split it from the logic that looks for it.
 */

/** The automatic category for money that only moved between your own accounts. */
export const OWN_MONEY_TITLE = 'Власні кошти';
/** Titles an "own money" group may still carry from before the app spoke Ukrainian. */
export const OWN_MONEY_TITLES: readonly string[] = [OWN_MONEY_TITLE, 'Own money'];

/** Automatic mode's catch-all for what no rule recognised. */
export const OTHER_TITLE = 'Інше';
/** Your own categories: nothing matched. */
export const UNCATEGORIZED_TITLE = 'Без категорії';
/** Own-money moves, set apart from spending and income. */
export const BETWEEN_ACCOUNTS_TITLE = 'Між своїми рахунками';
