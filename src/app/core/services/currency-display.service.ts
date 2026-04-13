import { computed, inject, Injectable, signal } from '@angular/core';
import { LocalStorage } from '@core/enums';
import { ICurrency } from '@core/interfaces';
import { take } from 'rxjs';
import { MonobankService } from './monobank.service';

export type DisplayCurrencyCode = 'UAH' | 'USD' | 'EUR';
type CurrencyInput = number | string | null | undefined;

type CurrencyOption = {
    code: DisplayCurrencyCode;
    numericCode: number;
    label: string;
    shortLabel: string;
};

const DISPLAY_CURRENCY_OPTIONS: CurrencyOption[] = [
    { code: 'UAH', numericCode: 980, label: 'UAH - Ukrainian Hryvnia', shortLabel: 'Hryvnia' },
    { code: 'USD', numericCode: 840, label: 'USD - US Dollar', shortLabel: 'US Dollar' },
    { code: 'EUR', numericCode: 978, label: 'EUR - Euro', shortLabel: 'Euro' },
];

@Injectable({ providedIn: 'root' })
export class CurrencyDisplayService {
    private readonly monobankService = inject(MonobankService);

    readonly options = DISPLAY_CURRENCY_OPTIONS;
    readonly rates = signal<ICurrency[]>([]);
    readonly loading = signal(false);
    readonly selectedCode = signal<DisplayCurrencyCode>(this.readSelectedCode());

    readonly selectedOption = computed(
        () => this.options.find(option => option.code === this.selectedCode()) ?? this.options[0],
    );

    readonly selectedNumericCode = computed(() => this.selectedOption().numericCode);
    readonly selectedLabel = computed(() => this.selectedOption().label);
    readonly selectedShortLabel = computed(() => this.selectedOption().shortLabel);
    readonly rateHint = computed(() => {
        const code = this.selectedCode();
        if (code === 'UAH') {
            return 'Base currency, no conversion needed';
        }

        const directRate = this.getRateBetween(980, this.selectedNumericCode());
        if (!directRate) {
            return 'Live rate unavailable';
        }

        return `1 ${code} ~= ${this.formatPlainNumber(1 / directRate, 2)} UAH`;
    });

    constructor() {
        this.refreshRates();
    }

    cycleCurrency(): void {
        const currentIndex = this.options.findIndex(option => option.code === this.selectedCode());
        const next = this.options[(currentIndex + 1) % this.options.length];
        this.setCurrency(next.code);
    }

    setCurrency(code: DisplayCurrencyCode): void {
        this.selectedCode.set(code);
        localStorage.setItem(LocalStorage.FinanceDisplayCurrency, code);
    }

    refreshRates(force = false): void {
        if (!force && this.rates().length > 0) {
            return;
        }

        this.loading.set(true);
        this.monobankService.getActualCurrency().pipe(take(1)).subscribe({
            next: (rows) => {
                this.rates.set(rows ?? []);
                this.loading.set(false);
            },
            error: () => {
                this.loading.set(false);
            },
        });
    }

    convertMinorAmount(amountMinor: number | null | undefined, sourceCurrencyCode: CurrencyInput = 980): number {
        return this.convertMajorAmount((amountMinor ?? 0) / 100, sourceCurrencyCode);
    }

    convertMinorAmountToMinorUnits(amountMinor: number | null | undefined, sourceCurrencyCode: CurrencyInput = 980): number {
        return Math.round(this.convertMinorAmount(amountMinor, sourceCurrencyCode) * 100);
    }

    convertMajorAmount(amountMajor: number | null | undefined, sourceCurrencyCode: CurrencyInput = 980): number {
        const value = amountMajor ?? 0;
        const targetNumericCode = this.selectedNumericCode();
        const rate = this.getRateBetween(this.resolveCurrencyCode(sourceCurrencyCode), targetNumericCode);

        if (!rate) {
            return value;
        }

        return value * rate;
    }

    formatMinorAmount(
        amountMinor: number | null | undefined,
        sourceCurrencyCode: CurrencyInput = 980,
        minimumFractionDigits = 2,
        maximumFractionDigits = 2,
    ): string {
        return this.formatConvertedValue(
            this.convertMinorAmount(amountMinor, sourceCurrencyCode),
            minimumFractionDigits,
            maximumFractionDigits,
        );
    }

    formatMajorAmount(
        amountMajor: number | null | undefined,
        sourceCurrencyCode: CurrencyInput = 980,
        minimumFractionDigits = 2,
        maximumFractionDigits = 2,
    ): string {
        return this.formatConvertedValue(
            this.convertMajorAmount(amountMajor, sourceCurrencyCode),
            minimumFractionDigits,
            maximumFractionDigits,
        );
    }

    mapTransactionAmountToDisplay<T extends { amount: number; currencyCode: number | string }>(transaction: T): T {
        return {
            ...transaction,
            amount: this.convertMinorAmount(transaction.amount, transaction.currencyCode),
        };
    }

    convertTransactionForMinorUnitCharts<T extends {
        amount: number;
        cashbackAmount?: number;
        balance?: number;
        operationAmount?: number;
        currencyCode: number | string;
    }>(transaction: T): T {
        return {
            ...transaction,
            amount: this.convertMinorAmountToMinorUnits(transaction.amount, transaction.currencyCode),
            cashbackAmount: transaction.cashbackAmount !== undefined
                ? this.convertMinorAmountToMinorUnits(transaction.cashbackAmount, transaction.currencyCode)
                : transaction.cashbackAmount,
            balance: transaction.balance !== undefined
                ? this.convertMinorAmountToMinorUnits(transaction.balance, transaction.currencyCode)
                : transaction.balance,
            operationAmount: transaction.operationAmount !== undefined
                ? this.convertMinorAmountToMinorUnits(transaction.operationAmount, transaction.currencyCode)
                : transaction.operationAmount,
        };
    }

    private formatConvertedValue(
        value: number,
        minimumFractionDigits: number,
        maximumFractionDigits: number,
    ): string {
        return new Intl.NumberFormat(this.resolveLocale(), {
            style: 'currency',
            currency: this.selectedCode(),
            minimumFractionDigits,
            maximumFractionDigits,
        }).format(value);
    }

    private resolveLocale(): string {
        return this.selectedCode() === 'UAH' ? 'uk-UA' : 'en-US';
    }

    private readSelectedCode(): DisplayCurrencyCode {
        const stored = localStorage.getItem(LocalStorage.FinanceDisplayCurrency) as DisplayCurrencyCode | null;
        if (stored && this.options.some(option => option.code === stored)) {
            return stored;
        }
        return 'USD';
    }

    private getRateBetween(sourceCurrencyCode: number, targetCurrencyCode: number): number | null {
        if (sourceCurrencyCode === targetCurrencyCode) {
            return 1;
        }

        const sourceToUah = this.getRateToUah(sourceCurrencyCode);
        const targetToUah = this.getRateToUah(targetCurrencyCode);

        if (!sourceToUah || !targetToUah) {
            return null;
        }

        return sourceToUah / targetToUah;
    }

    private resolveCurrencyCode(currency: CurrencyInput): number {
        if (typeof currency === 'number' && Number.isFinite(currency)) {
            return currency;
        }

        const normalized = String(currency ?? '').trim().toUpperCase();
        const option = this.options.find(item =>
            item.code === normalized || String(item.numericCode) === normalized,
        );

        return option?.numericCode ?? 980;
    }

    private getRateToUah(currencyCode: number): number | null {
        if (currencyCode === 980) {
            return 1;
        }

        const direct = this.rates().find(row => row.currencyCodeA === currencyCode && row.currencyCodeB === 980);
        if (direct) {
            return this.pickRate(direct);
        }

        const reverse = this.rates().find(row => row.currencyCodeA === 980 && row.currencyCodeB === currencyCode);
        if (reverse) {
            const reverseRate = this.pickRate(reverse);
            return reverseRate ? 1 / reverseRate : null;
        }

        return null;
    }

    private pickRate(row: ICurrency): number | null {
        if (row.rateCross) {
            return row.rateCross;
        }
        if (row.rateBuy && row.rateSell) {
            return (row.rateBuy + row.rateSell) / 2;
        }
        return row.rateSell || row.rateBuy || null;
    }

    private formatPlainNumber(value: number, digits: number): string {
        return new Intl.NumberFormat('uk-UA', {
            minimumFractionDigits: digits,
            maximumFractionDigits: digits,
        }).format(value);
    }
}
