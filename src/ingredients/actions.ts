'use server'

import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { requireSetupOrSession } from '@/auth/guards'
import { db } from '@/db'
import { type IngredientId, parseIngredientId } from '@/db/ids'
import {
    ingredientAliases,
    ingredientCountUnits,
    ingredients,
} from '@/db/schema'

type FieldsErrorKey =
    | 'canonicalRequired'
    | 'pickRole'
    | 'densityInvalid'
    | 'countUnitsInvalid'

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

function readFormFields(data: FormData): WriteFields | FieldsErrorKey {
    const canonicalDe = readOptionalString(data, 'canonicalDe')
    const canonicalEn = readOptionalString(data, 'canonicalEn')
    if (!canonicalDe && !canonicalEn) {
        return 'canonicalRequired'
    }
    const role = readRole(data)
    if (!role) {
        return 'pickRole'
    }
    const density = readOptionalNumber(data, 'density')
    if (density === 'invalid') {
        return 'densityInvalid'
    }
    const notes = readOptionalString(data, 'notes')
    const aliases = dedupCaseInsensitive(readStringList(data, 'alias'))
    const countUnits = parseCountUnits(data)
    if (countUnits === 'invalid') {
        return 'countUnitsInvalid'
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
    const tErr = await getTranslations('errors')
    const fields = readFormFields(data)
    if (typeof fields === 'string') {
        return { error: tErr(fields) }
    }
    let newId: IngredientId | undefined
    db.transaction(() => {
        const inserted = db
            .insert(ingredients)
            .values({
                canonicalDe: fields.canonicalDe,
                canonicalEn: fields.canonicalEn,
                role: fields.role,
                density: fields.density,
                notes: fields.notes,
            })
            .returning({ id: ingredients.id })
            .get()
        const id = inserted.id
        newId = id
        if (fields.aliases.length) {
            db.insert(ingredientAliases)
                .values(
                    fields.aliases.map((alias) => ({
                        ingredientId: id,
                        alias,
                    })),
                )
                .run()
        }
        if (fields.countUnits.length) {
            db.insert(ingredientCountUnits)
                .values(
                    fields.countUnits.map((cu) => ({
                        ingredientId: id,
                        unit: cu.unit,
                        gramsPerUnit: cu.gramsPerUnit,
                    })),
                )
                .run()
        }
    })
    if (!newId) {
        return { error: tErr('insertFailed') }
    }
    redirect(`/ingredients/${newId}`)
}

export async function updateIngredientAction(
    _prev: IngredientFormState,
    data: FormData,
): Promise<IngredientFormState> {
    await requireSetupOrSession()
    const tErr = await getTranslations('errors')
    const tForm = await getTranslations('ingredients.form')
    const id = parseIngredientId(readString(data, 'id'))
    if (!id) {
        return { error: tErr('invalidIngredient') }
    }
    const fields = readFormFields(data)
    if (typeof fields === 'string') {
        return { error: tErr(fields) }
    }
    const existing = db
        .select({ id: ingredients.id })
        .from(ingredients)
        .where(eq(ingredients.id, id))
        .get()
    if (!existing) {
        return { error: tErr('ingredientNotFound') }
    }
    db.transaction(() => {
        db.update(ingredients)
            .set({
                canonicalDe: fields.canonicalDe,
                canonicalEn: fields.canonicalEn,
                role: fields.role,
                density: fields.density,
                notes: fields.notes,
                updatedAt: new Date(),
            })
            .where(eq(ingredients.id, id))
            .run()
        db.delete(ingredientAliases)
            .where(eq(ingredientAliases.ingredientId, id))
            .run()
        if (fields.aliases.length) {
            db.insert(ingredientAliases)
                .values(
                    fields.aliases.map((alias) => ({
                        ingredientId: id,
                        alias,
                    })),
                )
                .run()
        }
        db.delete(ingredientCountUnits)
            .where(eq(ingredientCountUnits.ingredientId, id))
            .run()
        if (fields.countUnits.length) {
            db.insert(ingredientCountUnits)
                .values(
                    fields.countUnits.map((cu) => ({
                        ingredientId: id,
                        unit: cu.unit,
                        gramsPerUnit: cu.gramsPerUnit,
                    })),
                )
                .run()
        }
    })
    return { success: tForm('saved') }
}

export async function deleteIngredientAction(data: FormData): Promise<void> {
    await requireSetupOrSession()
    const raw = data.get('id')
    const id = typeof raw === 'string' ? parseIngredientId(raw) : null
    if (!id) {
        redirect('/ingredients')
    }
    db.delete(ingredients).where(eq(ingredients.id, id)).run()
    redirect('/ingredients')
}
