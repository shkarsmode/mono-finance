import { computed, inject, Injectable, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CategoryGroupService, CategoryMode } from './category-group.service';

/** Six validated chart hues (see --series-* in _themes.scss); everything else is gray. */
export const COLOR_SLOTS = 6;

type Slots = Array<string | null>;

const storageKey = (mode: CategoryMode) => `finance-category-colors-${mode}`;

function readSlots(mode: CategoryMode): Slots {
    try {
        const raw = JSON.parse(localStorage.getItem(storageKey(mode)) ?? '[]');
        if (Array.isArray(raw)) return Array.from({ length: COLOR_SLOTS }, (_, i) => (typeof raw[i] === 'string' ? raw[i] : null));
    } catch { /* fall through */ }
    return Array(COLOR_SLOTS).fill(null);
}

/**
 * Keep every category that stays in the top six on the colour it already has;
 * newcomers take the freed slots. Colour follows the category, never its rank —
 * a reshuffle inside the top six must not repaint anything.
 */
export function assignSlots(previous: Slots, nextTop: readonly string[]): Slots {
    const wanted = nextTop.slice(0, COLOR_SLOTS);
    const slots: Slots = Array.from({ length: COLOR_SLOTS }, (_, i) => {
        const title = previous[i] ?? null;
        return title && wanted.includes(title) ? title : null;
    });
    const newcomers = wanted.filter(title => !slots.includes(title));
    for (let i = 0; i < COLOR_SLOTS && newcomers.length; i++) {
        if (!slots[i]) slots[i] = newcomers.shift()!;
    }
    return slots;
}

/**
 * One colour per category across the whole app — ledger spines, the breakdown, the
 * charts, the categories page. The six biggest spending categories of the last year
 * get the six validated hues; every other category is a quiet gray, so no hue is ever
 * reused or generated (the old 12-step ramp cycled over 32 categories).
 */
@Injectable({ providedIn: 'root' })
export class CategoryColorsService {
    private readonly mode = toSignal(inject(CategoryGroupService).mode$, { requireSync: true });
    private readonly slotsByMode = signal<Record<CategoryMode, Slots>>({ auto: readSlots('auto'), mine: readSlots('mine') });

    /** Slot order: index 0 wears --series-1. */
    public readonly slots = computed(() => this.slotsByMode()[this.mode()]);

    public colorFor(title: string | null | undefined): string {
        if (!title) return 'var(--ink-3)';
        const slot = this.slots().indexOf(title);
        return slot >= 0 ? `var(--series-${slot + 1})` : 'var(--series-other)';
    }

    /** Feed the latest ranking (biggest first); slots only move for real entrants. */
    public setRanking(mode: CategoryMode, ranked: readonly string[]): void {
        const current = this.slotsByMode();
        const next = assignSlots(current[mode], ranked);
        if (next.every((title, i) => title === current[mode][i])) return;
        this.slotsByMode.set({ ...current, [mode]: next });
        try { localStorage.setItem(storageKey(mode), JSON.stringify(next)); } catch { /* private mode */ }
    }
}
