import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, Output, forwardRef } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
    selector: 'app-currency-exchange-input-block',
    templateUrl: './currency-exchange-input-block.component.html',
    styleUrl: './currency-exchange-input-block.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
    providers: [
        {
            provide: NG_VALUE_ACCESSOR,
            useExisting: forwardRef(() => CurrencyExchangeInputBlockComponent),
            multi: true,
        },
    ],
})
export class CurrencyExchangeInputBlockComponent
    implements ControlValueAccessor
{
    @Input() public flag: string;
    @Input() public name: string;
    @Input() public title: string;

    @Output() public onBlur: EventEmitter<FocusEvent> = new EventEmitter();
    @Output() public onInput: EventEmitter<void> = new EventEmitter();

    public value: string | undefined;
    
    private onChange: (value: string) => void;
    private onTouched: (value: string) => void;

    constructor(
        private readonly changeDetector: ChangeDetectorRef
    ) {}

    public onInputEvent = () => this.onInput.emit();
    public onBlurEvent = (event: FocusEvent) => this.onBlur.emit(event);

    public onInputValueChange(event: Event): void {
        const targetDivElement = event.target as HTMLInputElement;
        const value = targetDivElement.value;

        this.onChange(value);
        this.onInputEvent();
    }

    public writeValue(value: string): void {
        this.value = value ? value : '';
        this.changeDetector.detectChanges();
    }

    public registerOnChange(fn: (value: string) => void): void {
        this.onChange = fn;
    }

    public registerOnTouched(fn: (value: string) => void): void {
        this.onTouched = fn;
    }
}
