import { DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TransactionSortBy } from '@core/enums';
import { ITransaction } from '@core/interfaces';
import { CurrencyDisplayService, MonobankService } from '@core/services';
import { BASE_PATH_API } from '@core/tokens/monobank-environment.tokens';
import { first } from 'rxjs';
import { DisplayMoneyPipe } from '../../../../shared/pipes/display-money.pipe';
import { DisplayMoneyMajorPipe } from '../../../../shared/pipes/display-money-major.pipe';
import { TransactionsFilterPipe } from '../../../../shared/pipes/transactions-filter.pipe';
import { TransactionsSortByPipe } from '../../../../shared/pipes/transactions-sort-by.pipe';
import { TransactionsComponent } from '../dashboard/components';

interface CalendarDay {
    date: string;
    dayOfMonth: number;
    income: number;
    expense: number;
    net: number;
    txCount: number;
    topMerchant?: string;
}

interface CalendarMonth {
    year: number;
    month: number;
    days: CalendarDay[];
    totals: {
        income: number;
        expense: number;
        net: number;
        txCount: number;
        avgDailySpend: number;
        activeDays: number;
    };
}

@Component({
    selector: 'app-calendar',
    standalone: true,
    imports: [
        DecimalPipe,
        DisplayMoneyPipe,
        DisplayMoneyMajorPipe,
        TransactionsComponent,
        TransactionsFilterPipe,
        TransactionsSortByPipe,
    ],
    templateUrl: './calendar.component.html',
    styleUrl: './calendar.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class CalendarComponent implements OnInit {
    private readonly http = inject(HttpClient);
    private readonly router = inject(Router);
    private readonly baseApi = inject(BASE_PATH_API);
    private readonly monobankService = inject(MonobankService);
    readonly currencyDisplay = inject(CurrencyDisplayService);

    readonly calendarData = signal<CalendarMonth | null>(null);
    readonly loadingCalendar = signal(true);
    readonly loadingTransactions = signal(true);
    readonly activeYear = signal(new Date().getFullYear());
    readonly activeMonth = signal(new Date().getMonth() + 1);
    readonly selectedDay = signal<CalendarDay | null>(null);
    readonly monthTransactions = signal<ITransaction[]>([]);
    readonly transactionSearch = signal('');
    readonly transactionSortBy = signal<TransactionSortBy>(TransactionSortBy.Date);
    readonly transactionSortDirection = signal<'asc' | 'desc'>('desc');
    readonly transactionError = signal<string | null>(null);

    readonly weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    readonly loading = computed(() => this.loadingCalendar() || this.loadingTransactions());

    readonly monthName = computed(() => {
        const names = ['', 'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'];
        return names[this.activeMonth()];
    });

    readonly calendarGrid = computed(() => {
        const data = this.calendarData();
        if (!data) return [];

        const firstDay = new Date(Date.UTC(data.year, data.month - 1, 1)).getUTCDay();
        const leadingBlanks = firstDay === 0 ? 6 : firstDay - 1;
        const blanks: (CalendarDay | null)[] = Array(leadingBlanks).fill(null);
        return [...blanks, ...data.days];
    });

    readonly maxExpense = computed(() => {
        const data = this.calendarData();
        if (!data) return 1;
        return Math.max(1, ...data.days.map(day => day.expense));
    });

    readonly selectedDaySummary = computed(() => {
        const day = this.selectedDay();
        if (!day) {
            return null;
        }

        return `${day.date} - ${day.txCount} tx`;
    });

    ngOnInit(): void {
        this.loadMonth();
    }

    loadMonth(): void {
        this.loadingCalendar.set(true);
        this.loadingTransactions.set(true);
        this.transactionError.set(null);
        this.selectedDay.set(null);
        this.loadCalendarSummary();
        this.loadMonthTransactions();
    }

    prevMonth(): void {
        let month = this.activeMonth();
        let year = this.activeYear();

        if (month > 1) {
            month--;
        } else {
            month = 12;
            year--;
        }

        this.activeMonth.set(month);
        this.activeYear.set(year);
        this.loadMonth();
    }

    nextMonth(): void {
        let month = this.activeMonth();
        let year = this.activeYear();

        if (month < 12) {
            month++;
        } else {
            month = 1;
            year++;
        }

        this.activeMonth.set(month);
        this.activeYear.set(year);
        this.loadMonth();
    }

    selectDay(day: CalendarDay | null): void {
        if (!day || day.txCount === 0) return;
        this.selectedDay.set(this.selectedDay()?.date === day.date ? null : day);
    }

    heatLevel(day: CalendarDay): number {
        if (day.expense === 0) return 0;
        return Math.min(4, Math.ceil((day.expense / this.maxExpense()) * 4));
    }

    onSearchTransactions(value: string): void {
        this.transactionSearch.set(value);
    }

    onSortTransactions(sort: { sortBy: TransactionSortBy; direction: 'asc' | 'desc' }): void {
        this.transactionSortBy.set(sort.sortBy);
        this.transactionSortDirection.set(sort.direction);
    }

    onOpenTransaction(transaction: ITransaction): void {
        this.monobankService.rememberTransaction(transaction);
        this.router.navigate(['/transactions', transaction.id], {
            state: { transaction },
        });
    }

    private loadCalendarSummary(): void {
        const tz = -new Date().getTimezoneOffset();
        this.http.get<CalendarMonth>(
            `${this.baseApi}/calendar/${this.activeYear()}/${this.activeMonth()}?tz=${tz}`
        ).subscribe({
            next: (data) => {
                this.calendarData.set(data);
                this.loadingCalendar.set(false);
            },
            error: () => {
                this.loadingCalendar.set(false);
            },
        });
    }

    private loadMonthTransactions(): void {
        if (!this.monobankService.monobankActiveCardId) {
            this.monthTransactions.set([]);
            this.loadingTransactions.set(false);
            this.transactionError.set('Select a card on the dashboard to see monthly transactions here.');
            return;
        }

        this.monobankService.getTransactions(
            this.activeMonth(),
            this.activeYear(),
            {
                silent: true,
                store: false,
            },
        ).pipe(first()).subscribe({
            next: ({ data }) => {
                this.monthTransactions.set(data ?? []);
                this.loadingTransactions.set(false);
            },
            error: () => {
                this.monthTransactions.set([]);
                this.loadingTransactions.set(false);
                this.transactionError.set('Could not load transactions for the active card.');
            },
        });
    }
}
