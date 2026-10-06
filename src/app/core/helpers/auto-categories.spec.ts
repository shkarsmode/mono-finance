import { ITransaction } from '@core/interfaces';
import { buildAutoCategories } from './auto-categories';
import { categoryIndexOf, UNCATEGORIZED } from './categorize';
import { buildFlowContext } from './flows';

// Wording and MCCs as they appear in a real Monobank statement.
const tx = (description: string, amount: number, mcc = 4829): ITransaction => ({
    id: Math.random().toString(36).slice(2),
    time: 1_780_000_000,
    description,
    mcc,
    originalMcc: mcc,
    amount,
    operationAmount: amount,
    currencyCode: 980,
    cardCurrencyCode: 980,
    commissionRate: 0,
    cashbackAmount: 0,
    balance: 0,
    hold: false,
    receiptId: '',
} as ITransaction);

const groups = buildAutoCategories(buildFlowContext('Петренко Олена', ['Хата', 'Reserve']));
const titleOf = (t: ITransaction) => {
    const index = categoryIndexOf(t, groups);
    return index === UNCATEGORIZED ? null : groups[index].title;
};

describe('auto categories', () => {
    it('puts own-money moves in "Own money", which is not counted', () => {
        expect(titleOf(tx('Поповнення «Хата»', -500000))).toBe('Власні кошти');
        expect(titleOf(tx('З доларової картки', 4100000))).toBe('Власні кошти');
        expect(groups.find(g => g.title === 'Власні кошти')?.excluded).toBe(true);
    });

    it('sends someone else\'s jar to Donations, not Own money', () => {
        expect(titleOf(tx('Поповнення «На ППО 3 ОШБР»', -50000))).toBe('Донати й банки');
        expect(titleOf(tx('Base Sternenko Fund', -100000, 8398))).toBe('Донати й банки');
    });

    it('fixes the MCCs that mislead', () => {
        expect(titleOf(tx('Glovo', -42500, 4215))).toBe('Доставка їжі');
        expect(titleOf(tx('Нова пошта', -9000, 8999))).toBe('Пошта й доставка');
        expect(titleOf(tx('OpenAI', -84000, 5734))).toBe('Підписки й застосунки');
        expect(titleOf(tx('Steam', -40000, 5734))).toBe('Ігри');
        expect(titleOf(tx('Getmancar', -30000, 7512))).toBe('Таксі й транспорт');
        expect(titleOf(tx('Bolt Food', -30000, 5811))).toBe('Доставка їжі');
        expect(titleOf(tx('Bolt', -21900, 4121))).toBe('Таксі й транспорт');
    });

    it('files everyday MCCs', () => {
        expect(titleOf(tx('Сільпо', -84260, 5411))).toBe('Продукти');
        expect(titleOf(tx('Osama Sushi', -60000, 5812))).toBe('Кафе й ресторани');
        expect(titleOf(tx('WOG', -150000, 5541))).toBe('Авто');
        expect(titleOf(tx('Дія | Штрафи', -34000, 9399))).toBe('Авто');
        expect(titleOf(tx('Дія | Податки', -540000, 9311))).toBe('Податки й держпослуги');
        expect(titleOf(tx('Ryanair', -300000, 3246))).toBe('Подорожі');
    });

    it('treats installment payments as installments, not the shop they were bought in', () => {
        expect(titleOf(tx('Платіж FOXTROT', -899967))).toBe('Розстрочки й кредити');
        expect(titleOf(tx('Щомісячний платіж ЯБКО_14', -721533))).toBe('Розстрочки й кредити');
        expect(titleOf(tx('Comfy', -2000000, 5722))).toBe('Електроніка');
    });

    it('separates money in from money out on the same MCC', () => {
        expect(titleOf(tx('Від: Максим Баришов', 70000))).toBe('Перекази від людей');
        expect(titleOf(tx('Переказ на картку', -250000))).toBe('Перекази людям');
        expect(titleOf(tx('ФОП Красний Владислав', -2500000))).toBe('Послуги');
        expect(titleOf(tx('Від: ПЕТРЕНКО О.В. ФОП', 5000000))).toBe('Зарплата й бізнес');
        expect(titleOf(tx('ТОВ "БУСТІРОІД ЮКРЕЙН"', 6000000))).toBe('Зарплата й бізнес');
    });

    it('keeps a refund in the category of the purchase, so it nets the spending', () => {
        expect(titleOf(tx('Скасування. Bolt', 21900, 4121))).toBe('Таксі й транспорт');
        expect(titleOf(tx('Скасування. Glovo', 5000, 5811))).toBe('Доставка їжі');
    });

    it('does not misfile a person whose name contains a short brand', () => {
        // "eva" is inside "Kovalevska" — no short key may grab it
        expect(titleOf(tx('Від: Kovalevska Iryna', 100000))).toBe('Перекази від людей');
    });
});
