export interface ITransaction {
    readonly id: string;
    readonly time: number;
    readonly description: string;
    readonly mcc: number;
    readonly originalMcc: number;
    readonly amount: number;
    readonly operationAmount: number;
    readonly currencyCode: number;
    readonly cardCurrencyCode: number;
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
    /**
     * Set by the API: a «Переказ на картку» that landed on another of your own cards
     * (the other side says «З Білої картки», «З доларової картки»…). The row itself
     * cannot tell — this is how buying and selling your own dollars stops looking like
     * money sent to strangers.
     */
    readonly ownTransfer?: boolean;
}
