import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, Input, ViewChild } from '@angular/core';
import { ChartType } from '@core/enums';
import { ChartFactory } from '@core/helpers';
import { ITransactions } from '@core/interfaces';

@Component({
    selector: 'app-chart',
    templateUrl: './chart.component.html',
    styleUrl: './chart.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChartComponent implements AfterViewInit {
    @Input() public transactions: ITransactions[];
    @Input() public type: ChartType = ChartType.Income;
    @Input() public label: string;

    @ViewChild('chart') public chart: ElementRef;

    public ngAfterViewInit(): void {
        this.init();
    }

    private init(): void {
        new ChartFactory(
            this.transactions,
            this.chart.nativeElement,
            this.label,
            this.type
        ).init();
    }
}
