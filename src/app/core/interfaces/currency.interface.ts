export interface ICurrency {
    readonly currencyCodeA: number;
    readonly currencyCodeB: number;
    readonly date: number;
    readonly rateBuy: number;
    readonly rateSell: number;
    readonly rateCross: number;
    currencyNameA: string;
    currencyNameB: string;
    flagA: string;
    flagB: string;
}