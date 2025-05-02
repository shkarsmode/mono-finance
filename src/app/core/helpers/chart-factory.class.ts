import { ChartType } from "@core/enums";
import { ITransaction } from "@core/interfaces";
import Chart from 'chart.js/auto';
import moment from "moment";

const CHART_COLORS_MAP = {
    [ChartType.Income]: '#36a2eb',
    [ChartType.Expenses]: '#ff6384',
};

const CHART_BG_COLORS_MAP = {
    [ChartType.Income]: '#36a3eb53',
    [ChartType.Expenses]: '#ff63854d',
}

export class ChartFactory {
    private labels: string[];
    private data: number[];
    private chart: Chart;

    constructor(
        private transactions: ITransaction[],
        private readonly canvas: HTMLCanvasElement,
        private label: string,
        private type: ChartType
    ) {}

    public update(
        transactions: ITransaction[],
        label: string = this.label,
        type: ChartType = this.type
    ): void {
        this.transactions = transactions;
        this.label = label;
        this.type = type;

        this.prepareDataToCreate();
        this.updateFields();
    }

    public destroy(): void {
        this.chart.destroy();
    }

    private updateFields(): void {
        this.chart.data.labels = this.labels;
        this.chart.data.datasets.forEach((dataset) => {
            dataset.label = this.label;
            dataset.data = this.data;
            dataset.borderColor = CHART_COLORS_MAP[this.type];
            dataset.backgroundColor = CHART_BG_COLORS_MAP[this.type];
        });
        this.chart.update();
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
                        pointRadius: 8,
                        pointHoverRadius: 13,
                        fill: true,
                        borderCapStyle: 'square',
                        borderColor: CHART_COLORS_MAP[this.type],
                        backgroundColor: CHART_BG_COLORS_MAP[this.type],
                    },
                ],
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'top',
                    },
                    title: {
                        display: true,
                        text: this.label,
                    },
                },
            },
        });
    }

    private prepareDataToCreate(): void {
        const sortedTransactions = this.transactions.filter((transaction) =>
            this.type === ChartType.Income
                ? transaction.amount > 0
                : transaction.amount < 0
        );
        const dailyData = this.groupDataByDay(sortedTransactions);

        this.labels = dailyData.map((entry) => entry.day);
        this.data = dailyData.map((entry) => -entry.totalAmount);
    }

    private groupDataByDay(
        data: ITransaction[]
    ): { day: string; totalAmount: number }[] {
        if (!data.length) return [];

        const firstTxDate = moment.utc(data[0].time * 1000);
        const year = firstTxDate.year();
        const month = firstTxDate.month(); // 0-11
        const daysInMonth = firstTxDate.daysInMonth();

        const dailyTotals: Record<string, number> = {};
        for (let day = 1; day <= daysInMonth; day++) {
            const key = moment.utc([year, month, day]).format('YYYY-MM-DD');
            dailyTotals[key] = 0;
        }

        data.forEach((transaction) => {
            const txDate = moment.utc(transaction.time * 1000);
            if (txDate.year() !== year || txDate.month() !== month) return;

            const key = txDate.format('YYYY-MM-DD');
            dailyTotals[key] += -transaction.amount / 100;
        });

        return Object.entries(dailyTotals).map(([key, totalAmount]) => ({
            day: moment.utc(key).format('MMM D'),
            totalAmount,
        }));
    }
}