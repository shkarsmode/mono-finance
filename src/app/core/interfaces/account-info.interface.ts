export interface IAccountInfo {
    clientId: string;
    name: string;
    webHookUrl: string;
    permissions: string;
    accounts: IAccount[];
    jars: IJar[];
}

interface IJar {
    id: string;
    sendId: string;
    title: string;
    description: string;
    currencyCode: number;
    balance: number;
    goal: number;
}

export interface IAccount {
    id: string;
    sendId: string;
    currencyCode: number;
    cashbackType: string;
    balance: number;
    creditLimit: number;
    maskedPan: string[];
    type: string;
    iban: string;
}