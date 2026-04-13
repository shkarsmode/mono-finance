import { DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { BASE_PATH_API } from '@core/tokens/monobank-environment.tokens';

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
    imports: [DecimalPipe],
    templateUrl: './calendar.component.html',
    styleUrl: './calendar.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class CalendarComponent implements OnInit {
    private readonly http = inject(HttpClient);
    private readonly baseApi = inject(BASE_PATH_API);

    readonly calendarData = signal<CalendarMonth | null>(null);
    readonly loading = signal(true);
    readonly activeYear = signal(new Date().getFullYear());
    readonly activeMonth = signal(new Date().getMonth() + 1);
    readonly selectedDay = signal<CalendarDay | null>(null);

    readonly weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    readonly monthName = computed(() => {
        const names = ['', 'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'];
        return names[this.activeMonth()];
    });

    /** Grid cells including leading empty cells for day-of-week alignment */
    readonly calendarGrid = computed(() => {
        const data = this.calendarData();
        if (!data) return [];
        // Get the day of week for the 1st (0=Sun, adjust to Mon-start)
        const firstDay = new Date(Date.UTC(data.year, data.month - 1, 1)).getUTCDay();
        const leadingBlanks = firstDay === 0 ? 6 : firstDay - 1;
        const blanks: (CalendarDay | null)[] = Array(leadingBlanks).fill(null);
        return [...blanks, ...data.days];
    });

    /** Max daily expense for heat-map scaling */
    readonly maxExpense = computed(() => {
        const data = this.calendarData();
        if (!data) return 1;
        return Math.max(1, ...data.days.map(d => d.expense));
    });

    ngOnInit(): void {
        this.loadMonth();
    }

    loadMonth(): void {
        this.loading.set(true);
        this.selectedDay.set(null);
        const tz = -new Date().getTimezoneOffset();
        this.http.get<CalendarMonth>(
            `${this.baseApi}/calendar/${this.activeYear()}/${this.activeMonth()}?tz=${tz}`
        ).subscribe({
            next: (data) => {
                this.calendarData.set(data);
                this.loading.set(false);
            },
            error: () => this.loading.set(false),
        });
    }

    prevMonth(): void {
        let m = this.activeMonth();
        let y = this.activeYear();
        if (m > 1) { m--; } else { m = 12; y--; }
        this.activeMonth.set(m);
        this.activeYear.set(y);
        this.loadMonth();
    }

    nextMonth(): void {
        let m = this.activeMonth();
        let y = this.activeYear();
        if (m < 12) { m++; } else { m = 1; y++; }
        this.activeMonth.set(m);
        this.activeYear.set(y);
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
}
