import {
    AfterViewInit, ChangeDetectionStrategy, Component, ElementRef,
    Input, OnChanges, OnDestroy, SimpleChanges, ViewChild
} from '@angular/core';
import { ChartType } from '@core/enums';
import { ChartFactory, MonthlyAggregate } from '@core/helpers';
import { ITransaction } from '@core/interfaces';

type ChartMode = 'daily' | 'monthly';

@Component({
    selector: 'app-chart',
    templateUrl: './chart.component.html',
    styleUrl: './chart.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChartComponent implements AfterViewInit, OnChanges, OnDestroy {
    @Input() public label: string;
    @Input() public transactions: ITransaction[] | null = null;

    /** Новый вход — месячные агрегаты */
    @Input() public monthly: MonthlyAggregate[] | null = null;

    /** Новый вход — режим */
    @Input() public mode: ChartMode = 'daily';

    /** Новый вход — подпорка для ровной оси (только для mode='monthly') */
    @Input() public period?: { fromSec: number; toSec: number };

    /** Новый вход — настройки формата */
    @Input() public currency: string = 'грн';
    @Input() public minorUnits = true; // true, если суммы в копейках

    @Input() public type: ChartType = ChartType.Income;

    @ViewChild('chart', { static: true }) public chart!: ElementRef<HTMLCanvasElement>;

    private chartFactoryInstance!: ChartFactory;

    ngAfterViewInit(): void {
        this.init();
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (!this.chartFactoryInstance) return;
        // Любые входы — апдейт
        this.update();
    }

    private update(): void {
        const dataSource = this.mode === 'monthly'
            ? (this.monthly ?? [])
            : (this.transactions ?? []);

        this.chartFactoryInstance.update(
            dataSource,
            this.label,
            this.type,
            {
                mode: this.mode,
                currency: this.currency,
                minorUnits: this.minorUnits,
                period: this.period
            }
        );
    }

    private init(): void {
        const dataSource = this.mode === 'monthly'
            ? (this.monthly ?? [])
            : (this.transactions ?? []);

        this.chartFactoryInstance = new ChartFactory(
            dataSource,
            this.chart.nativeElement,
            this.label,
            this.type,
            {
                mode: this.mode,
                currency: this.currency,
                minorUnits: this.minorUnits,
                period: this.period
            }
        );
        this.chartFactoryInstance.init();
    }

    ngOnDestroy(): void {
        if (this.chartFactoryInstance) this.chartFactoryInstance.destroy();
    }
}
