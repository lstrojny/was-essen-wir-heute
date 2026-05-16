export const MASS_UNITS = ['g', 'kg', 'oz', 'lb'] as const
export const VOLUME_UNITS = ['ml', 'l', 'tsp', 'tbsp', 'cup'] as const
export const COUNT_UNITS_STARTER = [
    'piece',
    'clove',
    'slice',
    'leaf',
    'sprig',
    'bunch',
    'can',
    'jar',
    'pinch',
    'dash',
] as const

export type UnitCategory = 'mass' | 'volume' | 'count'

export type UnitOption = { value: string; category: UnitCategory }

export const STANDARD_UNIT_OPTIONS: UnitOption[] = [
    ...MASS_UNITS.map((value) => ({ value, category: 'mass' as const })),
    ...VOLUME_UNITS.map((value) => ({ value, category: 'volume' as const })),
    ...COUNT_UNITS_STARTER.map((value) => ({
        value,
        category: 'count' as const,
    })),
]

const KNOWN = new Set<string>([
    ...MASS_UNITS,
    ...VOLUME_UNITS,
    ...COUNT_UNITS_STARTER,
])

export function categoryOf(value: string): UnitCategory {
    if ((MASS_UNITS as readonly string[]).includes(value)) return 'mass'
    if ((VOLUME_UNITS as readonly string[]).includes(value)) return 'volume'
    return 'count'
}

export function isKnownUnit(value: string): boolean {
    return KNOWN.has(value)
}
