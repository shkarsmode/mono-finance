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

/** «вашу доларову картку», for «переказ на …» — by currency first, as people call them, then by colour. */
export function cardAccusative(type: string | null | undefined, currencyCode: number | null | undefined): string {
    if (currencyCode === 840) return 'вашу доларову картку';
    if (currencyCode === 978) return 'вашу єврову картку';
    if (currencyCode === 985) return 'вашу злотову картку';
    const byType: Record<string, string> = {
        black: 'вашу чорну картку', white: 'вашу білу картку', platinum: 'вашу платинову картку',
        iron: 'вашу залізну картку', fop: 'ваш ФОП-рахунок', yellow: 'вашу дитячу картку', eAid: 'вашу картку єПідтримки',
    };
    return byType[type ?? ''] ?? 'вашу іншу картку';
}

export function cardName(type: string | null | undefined): string {
    if (!type) return 'Картка';
    return CARD_NAMES[type] ?? type;
}
