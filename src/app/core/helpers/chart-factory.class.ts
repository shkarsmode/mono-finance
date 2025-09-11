import { ChartType } from '@core/enums';
import { ITransaction } from '@core/interfaces';
import Chart from 'chart.js/auto';
import moment from 'moment';

export interface MonthlyAggregate {
    year: number;   // 2025
    month: number;  // 1..12
    income: number; // в гривнах (если в копейках — см. опцию minorUnits)
    expense: number;// отрицательное или положительное — не важно, берём модуль
    tx: number;
}

const CHART_COLORS_MAP = {
    [ChartType.Income]: '#36a2eb',
    [ChartType.Expenses]: '#ff6384',
} as const;

const CHART_BG_COLORS_MAP = {
    [ChartType.Income]: '#36a3eb53',
    [ChartType.Expenses]: '#ff63854d',
} as const;

type Mode = 'daily' | 'monthly';

type ChartOptionsExt = {
    mode?: Mode;
    currency?: string;
    minorUnits?: boolean;
    period?: { fromSec: number; toSec: number };
    yMax?: number; // <-- new
};

export class ChartFactory {
    private labels: string[] = [];
    private data: number[] = [];
    private chart!: Chart;

    private mode: Mode;
    private currency: string;
    private minorUnits: boolean;
    private yMax?: number;

    constructor(
        private dataSource: ITransaction[] | MonthlyAggregate[],
        private readonly canvas: HTMLCanvasElement,
        private label: string,
        private type: ChartType,
        opts?: ChartOptionsExt
    ) {
        this.mode = opts?.mode ?? 'daily';
        this.currency = opts?.currency ?? 'грн';
        this.minorUnits = opts?.minorUnits ?? false;
        this.yMax = opts?.yMax; // <-- new
        if (opts?.period) (this as any)._period = opts.period;
    }

    public update(
        dataSource: ITransaction[] | MonthlyAggregate[],
        label: string = this.label,
        type: ChartType = this.type,
        opts?: Partial<ChartOptionsExt>
    ): void {
        this.dataSource = dataSource;
        this.label = label;
        this.type = type;
        if (opts?.mode) this.mode = opts.mode;
        if (opts?.currency) this.currency = opts.currency;
        if (typeof opts?.minorUnits === 'boolean') this.minorUnits = opts.minorUnits;
        if (opts?.period) (this as any)._period = opts.period;
        if (typeof opts?.yMax === 'number') this.yMax = opts.yMax; // <-- new
    
        this.prepareDataToCreate();
        this.updateFields();
    }

    public destroy(): void {
        if (this.chart) this.chart.destroy();
    }

    public init(): void {
        this.prepareDataToCreate();
        this.chart = new Chart(this.canvas, {
            type: 'line',
            data: {
                labels: this.labels,
                datasets: [
                    {
                        label: this.label,
                        data: this.data,
                        borderWidth: 2,
                        pointStyle: 'circle',
                        pointRadius: this.mode === 'monthly' ? 5 : 8,
                        pointHoverRadius: this.mode === 'monthly' ? 9 : 13,
                        fill: true,
                        borderCapStyle: 'square',
                        borderColor: CHART_COLORS_MAP[this.type],
                        backgroundColor: CHART_BG_COLORS_MAP[this.type],
                        tension: 0.25,
                    },
                ],
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'top' },
                    title: { display: true, text: this.label },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const v = ctx.parsed.y ?? 0;
                                return `${this.type === ChartType.Income ? 'Доход' : 'Расход'}: ${this.fmt(v)} ${this.currency}`;
                            },
                        },
                    },
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: this.resolveYMax(), // <-- new
                        ticks: {
                            callback: (v) => this.fmt(Number(v)),
                        },
                    },
                },
            },
        });
    }

    // ---------- data prep ----------

    private prepareDataToCreate(): void {
        if (this.mode === 'monthly') this.prepareDataToCreateMonthly();
        else this.prepareDataToCreateDaily();
    }

    /** DAILY (как у тебя было), мелкие правки по знакам/юнитам */
    private prepareDataToCreateDaily(): void {
        const txs = (this.dataSource as ITransaction[]) ?? [];
        const filtered = txs.filter(t =>
            this.type === ChartType.Income ? t.amount > 0 : t.amount < 0
        );

        const dailyTotals = this.groupDataByDay(filtered);
        this.labels = dailyTotals.map(e => e.day);
        // был двойной минус; делаем единообразно: всегда позитивные значения на графике
        this.data = dailyTotals.map(e => Math.abs(e.totalAmount));
    }

    /** MONTHLY: строим полный ряд месяцев по period или по min/max входных данных */
    private prepareDataToCreateMonthly(): void {
        const agg = (this.dataSource as MonthlyAggregate[]) ?? [];
        if (!agg.length) { this.labels = []; this.data = []; return; }

        // определяем диапазон
        const period = (this as any)._period as { fromSec: number; toSec: number } | undefined;
        let fromY: number, fromM: number, toY: number, toM: number;

        if (period) {
            const df = new Date(period.fromSec * 1000);
            const dt = new Date(period.toSec * 1000);
            fromY = df.getUTCFullYear(); fromM = df.getUTCMonth() + 1;
            toY   = dt.getUTCFullYear(); toM   = dt.getUTCMonth() + 1;
        } else {
            const sorted = [...agg].sort((a, b) => a.year === b.year ? a.month - b.month : a.year - b.year);
            fromY = sorted[0].year; fromM = sorted[0].month;
            toY   = sorted.at(-1)!.year; toM = sorted.at(-1)!.month;
        }

        // мэп по ключу YYYY-MM
        const byKey = new Map<string, MonthlyAggregate>();
        for (const a of agg) byKey.set(`${a.year}-${String(a.month).padStart(2,'0')}`, a);

        const labels: string[] = [];
        const vals: number[] = [];

        let y = fromY, m = fromM;
        while (y < toY || (y === toY && m <= toM)) {
            const key = `${y}-${String(m).padStart(2,'0')}`;
            const a = byKey.get(key);
            const income = a ? this.normalizeUnit(a.income) : 0;
            const expense = a ? Math.abs(this.normalizeUnit(a.expense)) : 0; // всегда модуль

            labels.push(moment.utc([y, m - 1, 1]).format('MMM YYYY'));
            vals.push(this.type === ChartType.Income ? income : expense);

            if (m < 12) m++; else { m = 1; y++; }
        }

        this.labels = labels;
        this.data = vals;
    }

    private groupDataByDay(data: ITransaction[]): { day: string; totalAmount: number }[] {
        if (!data.length) return [];

        // берём месяц первого tx (как у тебя)
        const first = moment.utc(Number((data[0] as any).time) * 1000);
        const year = first.year();
        const month = first.month(); // 0..11
        const days = first.daysInMonth();

        const totals: Record<string, number> = {};
        for (let d = 1; d <= days; d++) {
            const key = moment.utc([year, month, d]).format('YYYY-MM-DD');
            totals[key] = 0;
        }

        data.forEach(t => {
            const ts = Number((t as any).time);
            const dt = moment.utc(ts * 1000);
            if (dt.year() !== year || dt.month() !== month) return;
            const key = dt.format('YYYY-MM-DD');

            const amount = this.normalizeUnit((t as any).amount);
            totals[key] += Math.abs(amount); // всегда позитив
        });

        return Object.entries(totals).map(([k, totalAmount]) => ({
            day: moment.utc(k).format('MMM D'),
            totalAmount,
        }));
    }

    private normalizeUnit(v: number): number {
        // minorUnits === true => вход в копейках/центах
        return this.minorUnits ? v / 100 : v;
    }

    private fmt(n: number): string {
        return new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 2 }).format(n);
    }

    private updateFields(): void {
        this.chart.data.labels = this.labels;
        this.chart.data.datasets.forEach(ds => {
            ds.label = this.label;
            ds.data = this.data;
            (ds as any).borderColor = CHART_COLORS_MAP[this.type];
            (ds as any).backgroundColor = CHART_BG_COLORS_MAP[this.type];
        });
    
        const yScale = (this.chart.options.scales as any)?.y;
        if (yScale) {
            yScale.max = this.resolveYMax(); // <-- keep in sync
            yScale.beginAtZero = true;
        }
    
        this.chart.update();
    }

    private resolveYMax(): number | undefined {
        if (typeof this.yMax === 'number' && this.yMax > 0) {
            return this.yMax;
        }
        const dataMax = this.data.length ? Math.max(...this.data) : 0;
        if (!Number.isFinite(dataMax) || dataMax <= 0) return undefined;
        return Math.ceil(dataMax * 1.05);
    }
}
