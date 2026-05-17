'use server'

import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { requireSetupOrSession } from '@/auth/guards'
import { db } from '@/db'
import {
    type IngredientId,
    type IngredientsAliasId,
    parseIngredientId,
} from '@/db/ids'
import { ingredientCountUnits, ingredients } from '@/db/schema'
import type { Locale, LocaleMap } from '@/i18n/locale'
import { resolveLocale } from '@/i18n/resolve-locale'
import { mergeLocaleMap } from '@/i18n/translatable'
import { type AliasConflict, findAliasConflict, getIngredient } from './queries'
import {
    deleteAllIngredientTranslations,
    writeIngredientAliasGroup,
    writeIngredientCanonical,
} from './translation-writes'

function aliasConflictMessage(
    conflict: AliasConflict,
    tErr: (key: string, values?: Record<string, string | number>) => string,
): string {
    switch (conflict.reason) {
        case 'alias-on-other-ingredient':
        case 'canonical-on-other-ingredient':
            return tErr('aliasDuplicate', {
                alias: conflict.alias,
                owner: conflict.ownerLabel ?? '(?)',
            })
        case 'canonical-on-same-ingredient':
            return tErr('aliasEqualsCanonical', { alias: conflict.alias })
    }
}

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

function readAllStrings(data: FormData, name: string): string[] {
    return data
        .getAll(name)
        .filter((v): v is string => typeof v === 'string')
        .map((v) => v.trim())
}

type ParsedAlias = {
    existingId: IngredientsAliasId | null
    text: LocaleMap
}

function parseAliases(data: FormData, activeLocale: Locale): ParsedAlias[] {
    const values = readAllStrings(data, 'alias')
    const ids = readAllStrings(data, 'aliasId')
    const length = Math.max(values.length, ids.length)
    const out: ParsedAlias[] = []
    const seenFolds = new Set<string>()
    for (let i = 0; i < length; i++) {
        const raw = values[i] ?? ''
        const rawId = ids[i] ?? ''
        const existingId = rawId === '' ? null : (rawId as IngredientsAliasId)
        if (raw === '' && existingId === null) {
            continue
        }
        const text: LocaleMap = {}
        if (raw !== '') text[activeLocale] = raw
        if (raw !== '') {
            const fold = raw.toLowerCase()
            if (seenFolds.has(fold)) continue
            seenFolds.add(fold)
        }
        out.push({ existingId, text })
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
    canonical: LocaleMap
    role: Role
    density: number | null
    notes: string | null
    aliases: ParsedAlias[]
    countUnits: ParsedCountUnit[]
}

function readFormFields(
    data: FormData,
    activeLocale: Locale,
): WriteFields | FieldsErrorKey {
    const canonicalActive = readOptionalString(data, 'canonical') ?? ''
    const canonical: LocaleMap = {}
    if (canonicalActive !== '') canonical[activeLocale] = canonicalActive
    const role = readRole(data)
    if (!role) {
        return 'pickRole'
    }
    const density = readOptionalNumber(data, 'density')
    if (density === 'invalid') {
        return 'densityInvalid'
    }
    const notes = readOptionalString(data, 'notes')
    const aliases = parseAliases(data, activeLocale)
    const countUnits = parseCountUnits(data)
    if (countUnits === 'invalid') {
        return 'countUnitsInvalid'
    }
    return {
        canonical,
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
    const activeLocale = await resolveLocale()
    const fields = readFormFields(data, activeLocale)
    if (typeof fields === 'string') {
        return { error: tErr(fields) }
    }
    if (Object.keys(fields.canonical).length === 0) {
        return { error: tErr('canonicalRequired') }
    }
    const proposedAliasTexts = fields.aliases
        .map((a) => a.text[activeLocale])
        .filter((v): v is string => typeof v === 'string' && v.length > 0)
    const conflict = findAliasConflict(
        proposedAliasTexts,
        null,
        fields.canonical,
        activeLocale,
    )
    if (conflict) {
        return { error: aliasConflictMessage(conflict, tErr) }
    }
    let newId: IngredientId | undefined
    db.transaction(() => {
        const inserted = db
            .insert(ingredients)
            .values({
                role: fields.role,
                density: fields.density,
                notes: fields.notes,
            })
            .returning({ id: ingredients.id })
            .get()
        const id = inserted.id
        newId = id
        writeIngredientCanonical(id, fields.canonical)
        for (const alias of fields.aliases) {
            writeIngredientAliasGroup(id, null, alias.text)
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
    const activeLocale = await resolveLocale()
    const fields = readFormFields(data, activeLocale)
    if (typeof fields === 'string') {
        return { error: tErr(fields) }
    }
    const existing = getIngredient(id)
    if (!existing) {
        return { error: tErr('ingredientNotFound') }
    }
    const mergedCanonical = mergeForActiveLocale(
        existing.canonical,
        fields.canonical,
        activeLocale,
    )
    if (Object.keys(mergedCanonical).length === 0) {
        return { error: tErr('canonicalRequired') }
    }
    const existingAliasTexts = new Map<IngredientsAliasId, LocaleMap>()
    for (const a of existing.aliases) {
        existingAliasTexts.set(a.id, a.text)
    }
    const mergedAliases: Array<{
        existingId: IngredientsAliasId | null
        text: LocaleMap
    }> = []
    for (const alias of fields.aliases) {
        const prior =
            (alias.existingId && existingAliasTexts.get(alias.existingId)) ?? {}
        const merged = mergeForActiveLocale(prior, alias.text, activeLocale)
        if (Object.keys(merged).length === 0) {
            continue
        }
        mergedAliases.push({ existingId: alias.existingId, text: merged })
    }
    const proposedAliasTexts: string[] = []
    for (const a of mergedAliases) {
        for (const value of Object.values(a.text)) {
            if (value) proposedAliasTexts.push(value)
        }
    }
    const conflict = findAliasConflict(
        proposedAliasTexts,
        id,
        mergedCanonical,
        activeLocale,
    )
    if (conflict) {
        return { error: aliasConflictMessage(conflict, tErr) }
    }
    db.transaction(() => {
        db.update(ingredients)
            .set({
                role: fields.role,
                density: fields.density,
                notes: fields.notes,
                updatedAt: new Date(),
            })
            .where(eq(ingredients.id, id))
            .run()
        writeIngredientCanonical(id, mergedCanonical)
        const keepIds = new Set<IngredientsAliasId>()
        for (const alias of mergedAliases) {
            const writtenId = writeIngredientAliasGroup(
                id,
                alias.existingId,
                alias.text,
            )
            if (writtenId) keepIds.add(writtenId)
        }
        for (const existingAlias of existing.aliases) {
            if (!keepIds.has(existingAlias.id)) {
                writeIngredientAliasGroup(id, existingAlias.id, {})
            }
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

function mergeForActiveLocale(
    existing: LocaleMap,
    formPatch: LocaleMap,
    activeLocale: Locale,
): LocaleMap {
    const next = mergeLocaleMap(existing, formPatch)
    if (formPatch[activeLocale] === undefined) {
        delete next[activeLocale]
    }
    return next
}

export type AliasCheckConflict = {
    alias: string
    reason: AliasConflict['reason']
    ownerId: string | null
    ownerLabel: string | null
}

export type AliasCheckResult =
    | { ok: true }
    | { ok: false; conflict: AliasCheckConflict }

/**
 * Server action: synchronously validate one proposed alias without writing.
 * Used by IngredientForm to surface inline errors as the user adds.
 */
export async function checkAliasAvailableAction(
    proposed: string,
    excludeIngredientId: string | null,
    canonicalActive: string,
): Promise<AliasCheckResult> {
    await requireSetupOrSession()
    const trimmed = proposed.trim()
    if (!trimmed) return { ok: true }
    const exclude = excludeIngredientId
        ? parseIngredientId(excludeIngredientId)
        : null
    const activeLocale = await resolveLocale()
    const canonical: LocaleMap = {}
    if (canonicalActive) canonical[activeLocale] = canonicalActive
    const conflict = findAliasConflict(
        [trimmed],
        exclude,
        canonical,
        activeLocale,
    )
    if (!conflict) return { ok: true }
    return {
        ok: false,
        conflict: {
            alias: conflict.alias,
            reason: conflict.reason,
            ownerId: conflict.ownerId,
            ownerLabel: conflict.ownerLabel,
        },
    }
}

export async function deleteIngredientAction(data: FormData): Promise<void> {
    await requireSetupOrSession()
    const raw = data.get('id')
    const id = typeof raw === 'string' ? parseIngredientId(raw) : null
    if (!id) {
        redirect('/ingredients')
    }
    db.transaction(() => {
        deleteAllIngredientTranslations(id)
        db.delete(ingredients).where(eq(ingredients.id, id)).run()
    })
    redirect('/ingredients')
}
