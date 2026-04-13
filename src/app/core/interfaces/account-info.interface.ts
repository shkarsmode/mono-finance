export interface IAccountInfo {
    clientId: string;
    name: string;
    webHookUrl: string;
    permissions: string;
    accounts: IAccount[];
    jars: IJar[];
    managedClients?: IManagedClient[];
    categoryGroups?: any[];
    _meta?: {
        clientInfoUpdatedAt: number;
        clientInfoNextRefreshAt: number;
        webhookConfiguredAt: number;
        webhookCheckedAt: number;
        lastWebhookEventAt: number;
        webhookUrl?: string | null;
        clientInfoLastError?: string | null;
        webhookLastError?: string | null;
    };
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

interface IManagedClient {
    clientId: string;
    tin: number;
    name: string;
    accounts: IManagedAccount[];
}

interface IManagedAccount {
    id: string;
    balance: number;
    creditLimit: number;
    type: string;
    currencyCode: number;
    iban: string;
    sendId?: string;
    cashbackType?: string;
    maskedPan?: string[];
}
