import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
    name: 'maskedCard',
})
export class MaskedCardPipe implements PipeTransform {
    public transform(value: string): string {
        return value
            .split('')
            .map((char, index) => 
                (
                    (index+1) % 4 === 0 && index !== value.length - 1 ? 
                        char + ' ' : char
                )
            )
            .join('');
    }
}
