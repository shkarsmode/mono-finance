import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { currencyCodesMap } from '@core/data';
import { ITransaction } from '@core/interfaces';
import { CurrencyDisplayService, MonobankService } from '@core/services';
import { DisplayMoneyPipe } from '../../../../shared/pipes/display-money.pipe';
import { mccName } from '../../../../features/analytics-mcc/mcc-map';

@Component({
    selector: 'app-transaction-details',
    standalone: true,
    imports: [DatePipe, DisplayMoneyPipe],
    templateUrl: './transaction-details.component.html',
    styleUrl: './transaction-details.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class TransactionDetailsComponent implements OnInit {
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    private readonly monobankService = inject(MonobankService);
    readonly currencyDisplay = inject(CurrencyDisplayService);

    readonly transaction = signal<ITransaction | null>(null);
    readonly transactionId = signal('');

    readonly mccLabel = computed(() => {
        const mcc = this.transaction()?.mcc;
        return mcc ? mccName(mcc) : 'Merchant category unavailable';
    });

    readonly originalCurrencyCode = computed(() =>
        currencyCodesMap[this.transaction()?.currencyCode ?? 980]?.name ?? 'UAH',
    );

    readonly merchantDisplay = computed(() =>
        this.transaction()?.merchantName
        || this.transaction()?.counterName
        || this.transaction()?.description
        || 'Unknown merchant',
    );

    ngOnInit(): void {
        const transactionId = this.route.snapshot.paramMap.get('id') ?? '';
        this.transactionId.set(transactionId);

        const navigationState = history.state?.transaction as ITransaction | undefined;
        const resolvedTransaction = navigationState ?? this.monobankService.resolveTransactionSnapshot(transactionId);

        if (resolvedTransaction) {
            this.transaction.set(resolvedTransaction);
            this.monobankService.rememberTransaction(resolvedTransaction);
        }
    }

    goBack(): void {
        this.router.navigate(['/dashboard']);
    }

    formatOriginalMinorAmount(amount: number, currencyCode: number): string {
        return new Intl.NumberFormat(currencyCode === 980 ? 'uk-UA' : 'en-US', {
            style: 'currency',
            currency: currencyCodesMap[currencyCode]?.name ?? 'UAH',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format((amount ?? 0) / 100);
    }

    formatOriginalMajorAmount(amount: number, currencyCode: number): string {
        return new Intl.NumberFormat(currencyCode === 980 ? 'uk-UA' : 'en-US', {
            style: 'currency',
            currency: currencyCodesMap[currencyCode]?.name ?? 'UAH',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(amount ?? 0);
    }

    openMerchantSearch(): void {
        const merchant = this.transaction()?.merchantKey || this.transaction()?.merchantName || this.transaction()?.description;
        if (!merchant) {
            return;
        }

        this.router.navigate(['/analytics/mcc'], {
            queryParams: { search: merchant },
        });
    }
}
