import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, Input, OnChanges, OnDestroy, ViewChild } from '@angular/core';
import { ChartType } from '@core/enums';
import { ChartFactory } from '@core/helpers';
import { ITransaction } from '@core/interfaces';

@Component({
    selector: 'app-chart',
    templateUrl: './chart.component.html',
    styleUrl: './chart.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChartComponent implements AfterViewInit, OnChanges, OnDestroy {
    @Input() public label: string;
    @Input() public transactions: ITransaction[];
    @Input() public type: ChartType = ChartType.Income;

    @ViewChild('chart') public chart: ElementRef;
    
    private chartFactoryInstance: ChartFactory;
    
    public ngOnChanges(): void {
        if (this.chartFactoryInstance) this.update();
    }

    public ngAfterViewInit(): void {
        this.init();
    }

    private update(): void {
        this.chartFactoryInstance.update(
            this.transactions,
            this.label,
            this.type
        );
    }

    private init(): void {
        this.chartFactoryInstance = new ChartFactory(
            this.transactions,
            this.chart.nativeElement,
            this.label,
            this.type
        );
        this.chartFactoryInstance.init();
    }

    public ngOnDestroy(): void {
        this.chartFactoryInstance.destroy();
    }
}
