import { currencyCodesMap } from '@core/data';
import { cardName } from '@core/helpers/card-names';
import { IAccount, ICurrency } from '@core/interfaces';

/** One account as the dashboard prints it — worked out once, read by the hero and the switcher. */
export interface AccountView {
    readonly id: string;
    /** «Біла», «Чорна»… */
    readonly name: string;
    /** «UAH», «USD»… */
    readonly currency: string;
    /** The card's last four digits, «8813»; empty for an account without a card. */
    readonly last4: string;
    /** Own money (balance − credit limit), minor units of the account's currency. */
    readonly own: number;
    /** «2 840,15 ₴» — own money in the account's own currency, never converted. */
    readonly ownText: string;
    /** «≈ 4 980 ₴» for a foreign-currency account; null for hryvnia or without a rate. */
    readonly uahText: string | null;
    /** «50 000 ₴» when the card carries a credit limit. */
    readonly limitText: string | null;
    /** What the copy button copies: the IBAN, or the masked card number when there is none. */
    readonly copyValue: string;
    readonly copyIsIban: boolean;
}

const SYMBOLS: Record<number, string> = { 980: '₴', 840: '$', 978: '€', 985: 'zł' };

/** Monobank's balance includes the credit limit; this is the money that is yours. */
export function ownBalance(account: Pick<IAccount, 'balance' | 'creditLimit'>): number {
    return (Number(account.balance) || 0) - (Number(account.creditLimit) || 0);
}

/**
 * Hryvnias for one unit of `code`, from Monobank's rate table — the same pick as
 * CurrencyDisplayService: the cross rate, else the middle of buy and sell.
 */
export function rateToUah(rates: readonly ICurrency[], code: number): number | null {
    if (code === 980) return 1;
    const direct = rates.find(row => row.currencyCodeA === code && row.currencyCodeB === 980);
    if (direct) return pickRate(direct);
    const reverse = rates.find(row => row.currencyCodeA === 980 && row.currencyCodeB === code);
    const back = reverse ? pickRate(reverse) : null;
    return back ? 1 / back : null;
}

function pickRate(row: ICurrency): number | null {
    if (row.rateCross) return row.rateCross;
    if (row.rateBuy && row.rateSell) return (row.rateBuy + row.rateSell) / 2;
    return row.rateSell || row.rateBuy || null;
}

/** Minor units of `code` → hryvnias; null when there is no rate for that currency. */
export function toUah(minor: number, code: number, rates: readonly ICurrency[]): number | null {
    const rate = rateToUah(rates, code);
    return rate === null ? null : (minor / 100) * rate;
}

/** «2 840,15 ₴», «−1 200,00 $» — major units in their own currency, a real minus, never split. */
export function formatMoney(major: number, code: number, digits = 2): string {
    const value = Math.abs(major).toLocaleString('uk-UA', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    });
    const negative = major < 0 && Math.round(Math.abs(major) * 10 ** digits) > 0;
    const symbol = SYMBOLS[code] ?? currencyCodesMap[code]?.name ?? String(code);
    return `${negative ? '−' : ''}${value} ${symbol}`;
}

function lastFour(maskedPan: readonly string[] | null | undefined): string {
    return (maskedPan?.[0] ?? '').replace(/\D/g, '').slice(-4);
}

/** The white card first (the one people live on), then the bank's own order. */
export function sortAccounts(accounts: readonly IAccount[]): IAccount[] {
    return [...accounts].sort((a, b) => Number(b.type === 'white') - Number(a.type === 'white'));
}

export function toAccountView(account: IAccount, rates: readonly ICurrency[]): AccountView {
    const code = Number(account.currencyCode) || 980;
    const own = ownBalance(account);
    const uah = code === 980 ? null : toUah(own, code, rates);
    const iban = (account.iban ?? '').replace(/\s+/g, '');
    const limit = Number(account.creditLimit) || 0;
    return {
        id: account.id,
        name: cardName(account.type),
        currency: currencyCodesMap[code]?.name ?? String(code),
        last4: lastFour(account.maskedPan),
        own,
        ownText: formatMoney(own / 100, code),
        uahText: uah === null ? null : `≈ ${formatMoney(uah, 980, 0)}`,
        limitText: limit > 0 ? formatMoney(limit / 100, code, 0) : null,
        copyValue: iban || account.maskedPan?.[0] || '',
        copyIsIban: !!iban,
    };
}

/**
 * Put text on the clipboard. The async API needs a secure context and a focused
 * document; where it is missing or refuses, a hidden textarea does the job.
 */
export function copyText(text: string): Promise<void> {
    if (window.isSecureContext && navigator.clipboard?.writeText) {
        return navigator.clipboard.writeText(text).catch(() => legacyCopy(text));
    }
    return legacyCopy(text);
}

function legacyCopy(text: string): Promise<void> {
    const focused = document.activeElement as HTMLElement | null;
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    // 16px keeps iOS from zooming in on the field for the instant it exists
    area.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;font-size:16px';
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, text.length);
    let copied = false;
    try {
        copied = document.execCommand('copy');
    } catch {
        copied = false;
    }
    area.remove();
    focused?.focus({ preventScroll: true });
    return copied ? Promise.resolve() : Promise.reject(new Error('copy failed'));
}
