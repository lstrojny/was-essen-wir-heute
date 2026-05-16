'use server'

import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { requireSetupOrSession } from '@/auth/guards'
import { db } from '@/db'
import { type IngredientId, parseIngredientId } from '@/db/ids'
import {
    centralIngredientAliases,
    centralIngredientCountUnits,
    centralIngredients,
} from '@/db/schema'

const ROLES = ['starch', 'vegetable', 'protein', 'none'] as const
type Role = (typeof ROLES)[number]

export type IngredientFormState = { error?: string; success?: string }

function readString(data: FormData, name: string): string {
    const value = data.get(name)
    return typeof value === 'string' ? value.trim() : ''
}

function readOptionalString(data: FormData, name: string): string | null {
    const value = readString(data, name)
    return value === '' ? null : value
}

function readRole(data: FormData): Role | null {
    const value = readString(data, 'role')
    return (ROLES as readonly string[]).includes(value) ? (value as Role) : null
}

function readOptionalNumber(
    data: FormData,
    name: string,
): number | null | 'invalid' {
    const raw = readString(data, name)
    if (raw === '') {
        return null
    }
    const parsed = Number(raw.replace(',', '.'))
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return 'invalid'
    }
    return parsed
}

function readStringList(data: FormData, name: string): string[] {
    return data
        .getAll(name)
        .filter((v): v is string => typeof v === 'string')
        .map((v) => v.trim())
        .filter((v) => v.length > 0)
}

function dedupCaseInsensitive(values: string[]): string[] {
    const seen = new Set<string>()
    const out: string[] = []
    for (const value of values) {
        const key = value.toLowerCase()
        if (!seen.has(key)) {
            seen.add(key)
            out.push(value)
        }
    }
    return out
}

type ParsedCountUnit = { unit: string; gramsPerUnit: number }

function parseCountUnits(data: FormData): ParsedCountUnit[] | 'invalid' {
    const units = data
        .getAll('countUnitName')
        .map((v) => (typeof v === 'string' ? v.trim() : ''))
    const grams = data
        .getAll('countUnitGrams')
        .map((v) => (typeof v === 'string' ? v.trim() : ''))
    const out: ParsedCountUnit[] = []
    const seen = new Set<string>()
    const length = Math.max(units.length, grams.length)
    for (let i = 0; i < length; i++) {
        const unit = units[i] ?? ''
        const gramsRaw = grams[i] ?? ''
        if (unit === '' && gramsRaw === '') {
            continue
        }
        if (unit === '' || gramsRaw === '') {
            return 'invalid'
        }
        const gramsNum = Number(gramsRaw.replace(',', '.'))
        if (!Number.isFinite(gramsNum) || gramsNum <= 0) {
            return 'invalid'
        }
        const key = unit.toLowerCase()
        if (seen.has(key)) {
            return 'invalid'
        }
        seen.add(key)
        out.push({ unit, gramsPerUnit: gramsNum })
    }
    return out
}

type WriteFields = {
    canonicalDe: string | null
    canonicalEn: string | null
    role: Role
    density: number | null
    notes: string | null
    aliases: string[]
    countUnits: ParsedCountUnit[]
}

function readFormFields(data: FormData): WriteFields | string {
    const canonicalDe = readOptionalString(data, 'canonicalDe')
    const canonicalEn = readOptionalString(data, 'canonicalEn')
    if (!canonicalDe && !canonicalEn) {
        return 'Provide a canonical name in at least one language.'
    }
    const role = readRole(data)
    if (!role) {
        return 'Pick a role.'
    }
    const density = readOptionalNumber(data, 'density')
    if (density === 'invalid') {
        return 'Density must be a positive number (g/ml).'
    }
    const notes = readOptionalString(data, 'notes')
    const aliases = dedupCaseInsensitive(readStringList(data, 'alias'))
    const countUnits = parseCountUnits(data)
    if (countUnits === 'invalid') {
        return 'Count units must have a name and a positive grams-per-unit, and must not repeat within an entry.'
    }
    return {
        canonicalDe,
        canonicalEn,
        role,
        density,
        notes,
        aliases,
        countUnits,
    }
}

export async function createIngredientAction(
    _prev: IngredientFormState,
    data: FormData,
): Promise<IngredientFormState> {
    await requireSetupOrSession()
    const fields = readFormFields(data)
    if (typeof fields === 'string') {
        return { error: fields }
    }
    let newId: IngredientId | undefined
    db.transaction(() => {
        const inserted = db
            .insert(centralIngredients)
            .values({
                canonicalDe: fields.canonicalDe,
                canonicalEn: fields.canonicalEn,
                role: fields.role,
                density: fields.density,
                notes: fields.notes,
            })
            .returning({ id: centralIngredients.id })
            .get()
        const id = inserted.id
        newId = id
        if (fields.aliases.length) {
            db.insert(centralIngredientAliases)
                .values(
                    fields.aliases.map((alias) => ({
                        centralIngredientId: id,
                        alias,
                    })),
                )
                .run()
        }
        if (fields.countUnits.length) {
            db.insert(centralIngredientCountUnits)
                .values(
                    fields.countUnits.map((cu) => ({
                        centralIngredientId: id,
                        unit: cu.unit,
                        gramsPerUnit: cu.gramsPerUnit,
                    })),
                )
                .run()
        }
    })
    if (!newId) {
        return { error: 'Insert failed.' }
    }
    redirect(`/ingredients/${newId}`)
}

export async function updateIngredientAction(
    _prev: IngredientFormState,
    data: FormData,
): Promise<IngredientFormState> {
    await requireSetupOrSession()
    const id = parseIngredientId(readString(data, 'id'))
    if (!id) {
        return { error: 'Invalid ingredient id.' }
    }
    const fields = readFormFields(data)
    if (typeof fields === 'string') {
        return { error: fields }
    }
    const existing = db
        .select({ id: centralIngredients.id })
        .from(centralIngredients)
        .where(eq(centralIngredients.id, id))
        .get()
    if (!existing) {
        return { error: 'Ingredient not found.' }
    }
    db.transaction(() => {
        db.update(centralIngredients)
            .set({
                canonicalDe: fields.canonicalDe,
                canonicalEn: fields.canonicalEn,
                role: fields.role,
                density: fields.density,
                notes: fields.notes,
                updatedAt: new Date(),
            })
            .where(eq(centralIngredients.id, id))
            .run()
        db.delete(centralIngredientAliases)
            .where(eq(centralIngredientAliases.centralIngredientId, id))
            .run()
        if (fields.aliases.length) {
            db.insert(centralIngredientAliases)
                .values(
                    fields.aliases.map((alias) => ({
                        centralIngredientId: id,
                        alias,
                    })),
                )
                .run()
        }
        db.delete(centralIngredientCountUnits)
            .where(eq(centralIngredientCountUnits.centralIngredientId, id))
            .run()
        if (fields.countUnits.length) {
            db.insert(centralIngredientCountUnits)
                .values(
                    fields.countUnits.map((cu) => ({
                        centralIngredientId: id,
                        unit: cu.unit,
                        gramsPerUnit: cu.gramsPerUnit,
                    })),
                )
                .run()
        }
    })
    return { success: 'Ingredient saved.' }
}

export async function deleteIngredientAction(data: FormData): Promise<void> {
    await requireSetupOrSession()
    const raw = data.get('id')
    const id = typeof raw === 'string' ? parseIngredientId(raw) : null
    if (!id) {
        redirect('/ingredients')
    }
    db.delete(centralIngredients).where(eq(centralIngredients.id, id)).run()
    redirect('/ingredients')
}
