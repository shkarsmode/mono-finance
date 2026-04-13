export interface ITransaction {
    readonly id: string;
    readonly time: number;
    readonly description: string;
    readonly mcc: number;
    readonly originalMcc: number;
    readonly amount: number;
    readonly operationAmount: number;
    readonly currencyCode: number;
    readonly commissionRate: number;
    readonly cashbackAmount: number;
    readonly balance: number;
    readonly hold: boolean;
    readonly receiptId: string;
    readonly comment?: string;
    readonly invoiceId?: string;
    readonly counterEdrpou?: string;
    readonly counterIban?: string;
    readonly counterName?: string;
    readonly merchantName?: string;
    readonly merchantKey?: string;
}
