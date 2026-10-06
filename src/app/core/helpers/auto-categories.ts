import { ICategoryGroup } from '@core/interfaces';
import { OWN_MONEY_TITLE } from './category-titles';
import { FlowContext, flowOf } from './flows';

/**
 * The automatic categories: built from MCC codes plus the merchant names where the
 * MCC alone misleads. Composed from two years of the user's real statement — every
 * MCC with meaningful spend there has a home here, and the text rules fix the cases
 * MCC gets wrong (Glovo files under couriers, Нова пошта under professional
 * services, OpenAI and Steam under "computer software", car sharing under rentals).
 *
 * Order matters only for ties: MCC rules are tried in this order, and equal-length
 * text rules too. Longer text rules always beat shorter ones and beat every MCC rule.
 */

type Def = Omit<ICategoryGroup, 'amount'>;

/** Monobank's wording for paying off "Покупка частинами" and loans. */
const INSTALLMENT = /^(Платіж|Щомісячний платіж|Повне погашення|Дострокове погашення|Погашення|Платіж розстрочки)\s/i;

const def = (emoji: string, title: string, note: string, keys: string[], extra: Partial<Def> = {}): Def =>
    ({ emoji, title, note, keys, ...extra });

const DEFS: Def[] = [
    // ── income: credits only ─────────────────────────────────
    def('💼', 'Зарплата й бізнес', 'Роботодавці, ваш ФОП, Payoneer та інші виплати', [
        'ТОВ "', "ТОВ '", 'ТОВ «', 'ТОВАРИСТВО', 'ФОП', 'FOP', 'Payoneer', 'Upwork', 'Зарплат', 'Заробітн',
        'Аванс', 'Премія', 'Дивіденд',
    ], { direction: 'in' }),
    def('🪙', 'Кешбек і відсотки', 'Виведення кешбеку та відсотки', [
        'кешбек', 'кешбеку', 'cashback', 'відсотк', 'Відсотки',
    ], { direction: 'in' }),
    def('↘️', 'Перекази від людей', 'Гроші, які вам надіслали', ['4829', '6012', '6536', '6537', '6538', '6540'], { direction: 'in' }),

    // ── obligations first: "Платіж FOXTROT" is an installment, not electronics ──
    // A rule, not a key: "Платіж FOXTROT" must beat the shop name it carries, and
    // keys are trimmed and ranked by length, so "Платіж" alone would lose to "FOXTROT".
    def('🧾', 'Розстрочки й кредити', 'Платежі за розстрочками й кредитами', [
        '^Платіж', '^Повне погашення', '^Дострокове погашення', 'Платіж розстрочки', 'Щомісячний платіж',
        'погашення', 'Кредит',
    ], { direction: 'out', test: tx => INSTALLMENT.test((tx.description ?? '').trim()) }),

    // ── daily life ───────────────────────────────────────────
    def('🛒', 'Продукти', 'Супермаркети, магазини їжі й напоїв', [
        '5411', '5412', '5422', '5441', '5451', '5462', '5499',
        'Сільпо', 'АТБ', 'Novus', 'Ашан', 'Auchan', 'Фора', 'Варус', 'METRO', 'Велмарт', 'Таврія',
    ]),
    def('🍽', 'Кафе й ресторани', 'Ресторани, кафе, бари, фастфуд', [
        '5812', '5813', '5814',
        "McDonald", 'KFC', 'Пузата Хата', 'Lviv Croissants', 'Aroma Kava', 'Starbucks',
    ]),
    def('🛵', 'Доставка їжі', 'Glovo, Bolt Food та інша доставка', [
        '5811', 'Glovo', 'Bolt Food', 'Uber Eats', 'Rocket', 'Zakaz.ua',
    ]),
    def('🚕', 'Таксі й транспорт', 'Таксі, метро, автобуси, каршеринг', [
        '4111', '4121', '4131', '4789', '4011', '7512', '7513',
        'Uklon', 'Bolt', 'Uber', 'Київ Цифровий', 'Getmancar', 'GETMANCAR',
    ]),
    def('🚗', 'Авто', 'Пальне, сервіс, запчастини, мийка, паркінг, штрафи, страховка', [
        '5541', '5542', '5983', '7538', '7542', '7531', '7534', '7535', '7549', '5531', '5532', '5533', '5511', '5521',
        '5599', '7523', '6300',
        'WOG', 'ОККО', 'OKKO', 'UPG', 'SOCAR', 'Shell', 'БРСМ', 'Авіас', 'Штрафи', 'Паркінг', 'парковка', 'Parking',
        'MOYCAR', 'Мойcar', 'Автомийк', 'ОСЦПВ', 'ГЕРЦ', 'HUNTERS GARAGE', 'oiler', 'Інфошина', 'exist.ua',
    ]),
    def('🏠', 'Дім', 'Ремонт, меблі, комунальні послуги', [
        '4900', '5200', '5211', '5231', '5251', '5261', '5712', '5713', '5714', '5718', '5719', '7349', '1520', '1711',
        '1731', '1799', '0780',
        'Епіцентр', 'JYSK', 'IKEA', 'Leroy', 'Нова Лінія', 'Комунал', 'Водоканал', 'Енергозбут', 'Нафтогаз', 'ЯСНО',
        'Yasno', 'Квартплат', 'Київгаз',
    ]),
    def('📶', 'Зв’язок та інтернет', 'Мобільні оператори й домашній інтернет', [
        '4814', '4815', 'Vodafone', 'Київстар', 'Kyivstar', 'lifecell', 'Ланет', 'Volia', 'Тріолан',
    ]),

    // ── shopping ─────────────────────────────────────────────
    def('💻', 'Електроніка', 'Телефони, комп’ютери, техніка', [
        '5732', '5045', '5065', '5722', '4812', '5946',
        'Comfy', 'MOYO', 'Алло', 'Цитрус', 'Ябко', 'YABKO', 'Foxtrot', 'FOXTROT', 'TELEMART', 'EVEREST',
    ]),
    def('🛍', 'Покупки', 'Маркетплейси, універмаги й інший роздріб', [
        '5262', '5300', '5310', '5311', '5331', '5399', '5964', '5965', '5969', '5999', '5947',
        'Rozetka', 'Allegro', 'prom.ua', 'monomarket', 'AliExpress', 'Temu', 'Amazon', 'Kasta', 'Answear',
    ]),
    def('👕', 'Одяг', 'Одяг, взуття, аксесуари', [
        '5611', '5621', '5631', '5641', '5651', '5661', '5681', '5691', '5697', '5698', '5699', '5137', '5139',
        '5944', '5948', '5949',
        'Sinsay', 'Zara', 'PULL&BEAR', 'Stradivarius', 'Bershka', 'H&M', 'Reserved', 'DeFacto', 'NEW YORKER', 'PUMA',
    ]),
    def('💄', 'Краса й догляд', 'Косметика, барбершопи, салони', [
        '5977', '7230', '7297', '7298', 'Notino', 'Prostor', 'Watsons', 'BARBAR', 'barber',
    ]),
    def('💨', 'Тютюн', 'Тютюн, вейпи, кальян', ['5993', 'IQOS', 'KALIAN', 'Heets']),

    // ── health & body ────────────────────────────────────────
    def('💊', 'Здоров’я', 'Аптеки, лікарі, стоматологи, аналізи', [
        '5912', '5122', '8011', '8021', '8031', '8041', '8042', '8043', '8049', '8050', '8062', '8071', '8099',
        'Аптека', 'APTEKA', 'apteka', 'Сінево', 'Synevo', 'DentFarm', 'Оксфорд', 'Добробут', 'Esteva',
    ]),
    def('💪', 'Спорт', 'Спортзали, клуби, спорттовари', [
        '7997', '7941', '5941', '5655', '5940',
        'Decathlon', 'Ducks', 'YOUCANGYM', 'youcangym', 'Sportlife', 'DragomanovFit', 'APOLLO', 'Megasport',
    ]),

    // ── fun & digital ────────────────────────────────────────
    def('🎮', 'Ігри', 'Steam, ігрові магазини, покупки в іграх', [
        '5816', '7994', 'Steam', 'STEAM', 'G2A', 'dmarket', 'FACEIT', 'Chess.com', 'Epic Games', 'PlayStation',
        'Xbox', 'Nintendo',
    ]),
    def('🎬', 'Дозвілля', 'Кіно, події, відпочинок, іграшки', [
        '7832', '7922', '7929', '7932', '7933', '7991', '7995', '7996', '7998', '7999', '7911', '5945', '5733',
        'Multiplex', 'Планета Кіно', 'Karabas', 'Concert', 'Karting',
    ]),
    def('💳', 'Підписки й застосунки', 'Стрімінг, застосунки, ШІ, хмара, хостинг', [
        '5815', '5817', '5818', '4899', '4816', '5734', '7372',
        'OpenAI', 'ChatGPT', 'Anthropic', 'Claude.ai', 'Netflix', 'Spotify', 'YouTube', 'Apple', 'Google', 'Obsidian',
        'OBSIDIAN', 'iCloud', 'Hetzner', 'Megogo', 'Sweet.tv', 'Adobe', 'Notion', 'GitHub', 'JetBrains', 'Figma',
    ]),
    def('📚', 'Книги й навчання', 'Книги, канцелярія, курси', [
        '5942', '5943', '5192', '2741', '8211', '8220', '8241', '8244', '8249', '8299',
        'Librarium', 'LIBRARIUM', 'Книгарня', 'Yakaboo', 'Coursera', 'Udemy', 'Prometheus',
    ]),
    def('✈️', 'Подорожі', 'Авіаквитки, потяги, готелі, турагенції', [
        '3000-3999', '4112', '4411', '4511', '4582', '4722', '7011', '7032', '7033',
        'Укрзалізниця', 'Booking', 'Airbnb', 'Ryanair', 'Wizz', 'FlixBus',
    ]),

    // ── people & obligations ─────────────────────────────────
    def('🐾', 'Тварини', 'Зоомагазини й ветеринари', ['5995', '0742', 'E-ZOO', 'Зоосвіт', 'MasterZoo']),
    def('💐', 'Подарунки й квіти', 'Квіти й магазини подарунків', ['5992', 'Flowers', 'Квіти', 'KVITY', 'Fleurop']),
    def('❤️', 'Донати й банки', 'Донати й гроші в чужі банки', [
        '8398', '8641', '8651', '8661',
        // own jars are caught first by "Власні кошти", so what is left here is someone else's jar
        'Поповнення «', 'Регулярне поповнення «', 'Sternenko', 'Повернись живим', 'United24', 'Притул',
    ]),
    def('📦', 'Пошта й доставка', 'Нова пошта та інші перевізники', [
        '4214', '4215', 'Нова пошта', 'Nova Poshta', 'Укрпошта', 'Meest',
    ]),
    def('🏛', 'Податки й держпослуги', 'Податки, ЄСВ, державні послуги', [
        '9211', '9222', '9311', '9399', '9402', '9405', 'Податк', 'ЄСВ', 'DIIA.APP.TAX', 'DIIA.APP.FUND', 'EP *GOS',
    ]),
    def('🏧', 'Готівка', 'Зняття в банкоматах і касах', ['6010', '6011', 'Банкомат', 'Каса '], { direction: 'out' }),
    def('🧰', 'Послуги', 'Оплати ФОПам і компаніям, студіям, агенціям, PayPal', [
        'ФОП', 'FOP', 'ТОВ "', "ТОВ '", 'ТОВ «', 'ТОВАРИСТВО', 'ПП ', 'PayPal',
        '7221', '7299', '7311', '7392', '7393', '7394', '7399', '8111', '8931', '8999',
    ], { direction: 'out' }),
    def('↗️', 'Перекази людям', 'Перекази з картки на картку іншим людям', [
        '4829', '6012', '6536', '6537', '6538', '6540', 'Переказ на картку',
    ], { direction: 'out' }),
];

/** Titles in display order — stable, so colours stay put between sessions. */
export const AUTO_CATEGORY_COUNT = DEFS.length + 1;

const builtCache = new WeakMap<FlowContext, ICategoryGroup[]>();

/**
 * The automatic category list for a profile. "Власні кошти" comes first and is decided
 * by the flow classifier (own jars, own cards, deposits, your name at another bank),
 * so a jar top-up can never be filed under donations or transfers.
 */
export function buildAutoCategories(ctx: FlowContext): ICategoryGroup[] {
    const cached = builtCache.get(ctx);
    if (cached) return cached;

    const ownMoney: ICategoryGroup = {
        emoji: '🔁',
        title: OWN_MONEY_TITLE,
        note: 'Банки, інші ваші картки, депозити, ваші рахунки в інших банках — не враховуються',
        keys: [],
        excluded: true,
        amount: 0,
        test: tx => flowOf(tx, ctx) === 'internal',
    };

    const groups: ICategoryGroup[] = [ownMoney, ...DEFS.map(d => ({ ...d, keys: [...d.keys], amount: 0 }))];
    builtCache.set(ctx, groups);
    return groups;
}
