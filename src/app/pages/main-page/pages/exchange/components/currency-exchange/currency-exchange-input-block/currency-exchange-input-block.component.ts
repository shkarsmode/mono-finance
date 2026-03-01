import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, Output, forwardRef, inject } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
    selector: 'app-currency-exchange-input-block',
    standalone: true,
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
export class CurrencyExchangeInputBlockComponent implements ControlValueAccessor {
    @Input() flag = '';
    @Input() name = '';
    @Input() title = '';

    @Output() onBlur = new EventEmitter<FocusEvent>();
    @Output() onInput = new EventEmitter<void>();

    value = '';

    private onChange: (value: string) => void = () => {};
    private onTouched: () => void = () => {};
    private readonly cdr = inject(ChangeDetectorRef);

    onBlurEvent(event: FocusEvent): void {
        this.onTouched();
        this.onBlur.emit(event);
    }

    onInputValueChange(event: Event): void {
        const value = (event.target as HTMLInputElement).value;
        this.onChange(value);
        this.onInput.emit();
    }

    writeValue(value: string): void {
        this.value = value ?? '';
        this.cdr.detectChanges();
    }

    registerOnChange(fn: (value: string) => void): void {
        this.onChange = fn;
    }

    registerOnTouched(fn: () => void): void {
        this.onTouched = fn;
    }
}
