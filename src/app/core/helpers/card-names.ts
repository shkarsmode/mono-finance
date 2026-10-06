/** Monobank account types, named the way the bank's own app names the cards. */
const CARD_NAMES: Record<string, string> = {
    black: 'Чорна',
    white: 'Біла',
    platinum: 'Platinum',
    iron: 'Iron',
    fop: 'ФОП',
    yellow: 'Дитяча',
    eAid: 'єПідтримка',
    madeInUkraine: 'Made in Ukraine',
    rebuilding: 'єВідновлення',
};

export function cardName(type: string | null | undefined): string {
    if (!type) return 'Картка';
    return CARD_NAMES[type] ?? type;
}
