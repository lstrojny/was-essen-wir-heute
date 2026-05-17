'use server'

import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { requireSetupOrSession } from '@/auth/guards'
import { db } from '@/db'
import {
    type CuisineKey,
    type IngredientId,
    parseCuisineKey,
    parseIngredientId,
    parseRecipeId,
    parseRecipeStepId,
    type RecipeId,
    type RecipeStepId,
} from '@/db/ids'
import {
    ingredients,
    recipeComponents,
    recipeIngredients,
    recipeSteps,
    recipes,
} from '@/db/schema'
import type { Locale, LocaleMap } from '@/i18n/locale'
import { resolveLocale } from '@/i18n/resolve-locale'
import { mergeLocaleMap, resolveText } from '@/i18n/translatable'
import { findIngredientByName } from '@/ingredients/queries'
import { writeIngredientCanonical } from '@/ingredients/translation-writes'
import {
    findDirectChildrenForMany,
    findRecipesReferencing,
    getRecipe,
} from './queries'
import {
    deleteRecipeTranslationGroups,
    deleteStepTranslationGroupsForRecipe,
    writeRecipeStepTranslation,
    writeRecipeTranslationUnit,
} from './translation-writes'

type FieldsErrorKey =
    | 'titleRequired'
    | 'pickCuisine'
    | 'activeTimeInvalid'
    | 'waitTimeInvalid'
    | 'ingredientNameRequired'
    | 'ingredientAmountInvalid'
    | 'stepEmpty'
    | 'componentCycle'
    | 'componentSelfReference'
    | 'formServingsInvalid'

export type RecipeFormState = { error?: string; success?: string }

function readString(data: FormData, name: string): string {
    const value = data.get(name)
    return typeof value === 'string' ? value.trim() : ''
}

function readOptionalString(data: FormData, name: string): string | null {
    const value = readString(data, name)
    return value === '' ? null : value
}

function readAllStrings(data: FormData, name: string): string[] {
    return data.getAll(name).map((v) => (typeof v === 'string' ? v : ''))
}

function readNonNegativeInt(
    data: FormData,
    name: string,
): number | 'invalid' | null {
    const raw = readString(data, name)
    if (raw === '') {
        return null
    }
    const n = Number(raw)
    if (!Number.isInteger(n) || n < 0) {
        return 'invalid'
    }
    return n
}

function readPositiveDecimalOrNull(value: string): number | null | 'invalid' {
    const raw = value.trim()
    if (raw === '') {
        return null
    }
    const n = Number(raw.replace(',', '.'))
    if (!Number.isFinite(n) || n <= 0) {
        return 'invalid'
    }
    return n
}

type ParsedIngredient = {
    amount: number | null
    unit: string | null
    name: string
    ingredientId: IngredientId | null
}

function parseIngredients(data: FormData): ParsedIngredient[] | FieldsErrorKey {
    const names = readAllStrings(data, 'ingredientName')
    const amounts = readAllStrings(data, 'ingredientAmount')
    const units = readAllStrings(data, 'ingredientUnit')
    const centralIds = readAllStrings(data, 'ingredientCentralId')
    const out: ParsedIngredient[] = []
    const length = Math.max(
        names.length,
        amounts.length,
        units.length,
        centralIds.length,
    )
    for (let i = 0; i < length; i++) {
        const name = (names[i] ?? '').trim()
        const amountRaw = (amounts[i] ?? '').trim()
        const unit = (units[i] ?? '').trim()
        const centralRaw = (centralIds[i] ?? '').trim()
        const allEmpty =
            name === '' && amountRaw === '' && unit === '' && centralRaw === ''
        if (allEmpty) {
            continue
        }
        if (name === '') {
            return 'ingredientNameRequired'
        }
        const amount = readPositiveDecimalOrNull(amountRaw)
        if (amount === 'invalid') {
            return 'ingredientAmountInvalid'
        }
        const ingredientId =
            centralRaw === '' ? null : parseIngredientId(centralRaw)
        out.push({
            name,
            amount,
            unit: unit === '' ? null : unit,
            ingredientId,
        })
    }
    return out
}

type ParsedStep = {
    existingId: RecipeStepId | null
    text: LocaleMap
}

function parseSteps(
    data: FormData,
    activeLocale: Locale,
): ParsedStep[] | FieldsErrorKey {
    const texts = readAllStrings(data, 'step')
    const ids = readAllStrings(data, 'stepId')
    const length = Math.max(texts.length, ids.length)
    const out: ParsedStep[] = []
    for (let i = 0; i < length; i++) {
        const trimmed = (texts[i] ?? '').trim()
        const rawId = (ids[i] ?? '').trim()
        const existingId = rawId === '' ? null : parseRecipeStepId(rawId)
        if (trimmed === '' && existingId === null) {
            continue
        }
        const text: LocaleMap = {}
        if (trimmed !== '') text[activeLocale] = trimmed
        out.push({ existingId, text })
    }
    return out
}

function parseComponents(data: FormData): RecipeId[] {
    const out: RecipeId[] = []
    for (const raw of readAllStrings(data, 'componentChildId')) {
        const id = parseRecipeId(raw.trim())
        if (id) {
            out.push(id)
        }
    }
    return out
}

type WriteFields = {
    title: LocaleMap
    notes: LocaleMap
    cuisineKey: CuisineKey
    activeTimeMinutes: number
    waitTimeMinutes: number
    isCompleteMeal: boolean
    ingredients: ParsedIngredient[]
    steps: ParsedStep[]
    components: RecipeId[]
}

function readFormFields(
    data: FormData,
    activeLocale: Locale,
): WriteFields | FieldsErrorKey {
    const titleActive = readOptionalString(data, 'title') ?? ''
    const title: LocaleMap = {}
    if (titleActive !== '') title[activeLocale] = titleActive
    const notesActive = readOptionalString(data, 'notes') ?? ''
    const notes: LocaleMap = {}
    if (notesActive !== '') notes[activeLocale] = notesActive
    const cuisineKey = parseCuisineKey(readString(data, 'cuisineKey'))
    if (!cuisineKey) {
        return 'pickCuisine'
    }
    const activeTime = readNonNegativeInt(data, 'activeTimeMinutes')
    if (activeTime === 'invalid' || activeTime === null) {
        return 'activeTimeInvalid'
    }
    const waitTimeRaw = readNonNegativeInt(data, 'waitTimeMinutes')
    if (waitTimeRaw === 'invalid') {
        return 'waitTimeInvalid'
    }
    const waitTime = waitTimeRaw ?? 0
    const formServingsRaw = readNonNegativeInt(data, 'formServings')
    if (
        formServingsRaw === 'invalid' ||
        formServingsRaw === null ||
        formServingsRaw < 1
    ) {
        return 'formServingsInvalid'
    }
    const formServings = formServingsRaw
    const ingredients = parseIngredients(data)
    if (!Array.isArray(ingredients)) {
        return ingredients
    }
    const normalizedIngredients = ingredients.map((ing) =>
        ing.amount === null
            ? ing
            : { ...ing, amount: ing.amount / formServings },
    )
    const steps = parseSteps(data, activeLocale)
    if (!Array.isArray(steps)) {
        return steps
    }
    return {
        title,
        notes,
        cuisineKey,
        activeTimeMinutes: activeTime,
        waitTimeMinutes: waitTime,
        isCompleteMeal: data.get('isCompleteMeal') === 'on',
        ingredients: normalizedIngredients,
        steps,
        components: parseComponents(data),
    }
}

function wouldCreateCycle(parentId: RecipeId, childId: RecipeId): boolean {
    if (parentId === childId) {
        return true
    }
    const visited = new Set<RecipeId>()
    let frontier: RecipeId[] = [childId]
    while (frontier.length > 0) {
        const nextFrontier: RecipeId[] = []
        for (const id of frontier) {
            if (visited.has(id)) continue
            visited.add(id)
            if (id === parentId) {
                return true
            }
            nextFrontier.push(id)
        }
        frontier = findDirectChildrenForMany(nextFrontier)
    }
    return false
}

function resolveOrCreateIngredients(
    rows: ParsedIngredient[],
    activeLanguage: Locale,
): ParsedIngredient[] {
    return rows.map((ing) => {
        if (ing.ingredientId) {
            return ing
        }
        const trimmedName = ing.name.trim()
        if (!trimmedName) {
            return ing
        }
        const existing = findIngredientByName(trimmedName)
        if (existing) {
            return { ...ing, ingredientId: existing }
        }
        const inserted = db
            .insert(ingredients)
            .values({
                role: 'none',
                density: null,
                notes: null,
            })
            .returning({ id: ingredients.id })
            .get()
        writeIngredientCanonical(inserted.id, {
            [activeLanguage]: trimmedName,
        })
        return { ...ing, ingredientId: inserted.id }
    })
}

function writeChildRows(
    id: RecipeId,
    fields: WriteFields,
    mode: 'insert' | 'replace',
    existingStepTexts: Map<RecipeStepId, LocaleMap>,
) {
    if (mode === 'replace') {
        deleteStepTranslationGroupsForRecipe(id)
        db.delete(recipeIngredients)
            .where(eq(recipeIngredients.recipeId, id))
            .run()
        db.delete(recipeSteps).where(eq(recipeSteps.recipeId, id)).run()
        db.delete(recipeComponents)
            .where(eq(recipeComponents.parentRecipeId, id))
            .run()
    }
    if (fields.ingredients.length) {
        db.insert(recipeIngredients)
            .values(
                fields.ingredients.map((ing, position) => ({
                    recipeId: id,
                    position,
                    amount: ing.amount,
                    unit: ing.unit,
                    name: ing.name,
                    ingredientId: ing.ingredientId,
                })),
            )
            .run()
    }
    if (fields.steps.length) {
        const inserted = db
            .insert(recipeSteps)
            .values(
                fields.steps.map((_step, position) => ({
                    recipeId: id,
                    position,
                })),
            )
            .returning({ id: recipeSteps.id, position: recipeSteps.position })
            .all()
        inserted.sort((a, b) => a.position - b.position)
        for (const [i, row] of inserted.entries()) {
            const parsed = fields.steps[i]
            const prior = parsed.existingId
                ? (existingStepTexts.get(parsed.existingId) ?? {})
                : {}
            const merged = mergeLocaleMap(prior, parsed.text)
            writeRecipeStepTranslation(row.id, merged)
        }
    }
    if (fields.components.length) {
        db.insert(recipeComponents)
            .values(
                fields.components.map((childId, position) => ({
                    parentRecipeId: id,
                    childRecipeId: childId,
                    position,
                })),
            )
            .run()
    }
}

const SOURCES = ['manual', 'spoonacular', 'llm-chat'] as const
type RecipeSource = (typeof SOURCES)[number]

function readSource(data: FormData): RecipeSource {
    const value = readString(data, 'source')
    return (SOURCES as readonly string[]).includes(value)
        ? (value as RecipeSource)
        : 'manual'
}

export async function createRecipeAction(
    _prev: RecipeFormState,
    data: FormData,
): Promise<RecipeFormState> {
    await requireSetupOrSession()
    const tErr = await getTranslations('errors')
    const activeLanguage = await resolveLocale()
    const fields = readFormFields(data, activeLanguage)
    if (typeof fields === 'string') {
        return { error: tErr(fields) }
    }
    if (Object.keys(fields.title).length === 0) {
        return { error: tErr('titleRequired') }
    }
    const source = readSource(data)
    const sourceIdentifier = readString(data, 'sourceIdentifier') || null
    let newId: RecipeId | undefined
    db.transaction(() => {
        fields.ingredients = resolveOrCreateIngredients(
            fields.ingredients,
            activeLanguage,
        )
        const inserted = db
            .insert(recipes)
            .values({
                cuisineKey: fields.cuisineKey,
                activeTimeMinutes: fields.activeTimeMinutes,
                waitTimeMinutes: fields.waitTimeMinutes,
                isCompleteMeal: fields.isCompleteMeal,
                source,
                sourceIdentifier,
            })
            .returning({ id: recipes.id })
            .get()
        const id = inserted.id
        newId = id
        writeRecipeTranslationUnit(id, 'title', fields.title)
        writeRecipeTranslationUnit(id, 'notes', fields.notes)
        writeChildRows(id, fields, 'insert', new Map())
    })
    if (!newId) {
        return { error: tErr('insertFailed') }
    }
    redirect(`/recipes/${newId}`)
}

export async function updateRecipeAction(
    _prev: RecipeFormState,
    data: FormData,
): Promise<RecipeFormState> {
    await requireSetupOrSession()
    const tErr = await getTranslations('errors')
    const tForm = await getTranslations('recipes.form')
    const id = parseRecipeId(readString(data, 'id'))
    if (!id) {
        return { error: tErr('invalidRecipe') }
    }
    const activeLanguage = await resolveLocale()
    const fields = readFormFields(data, activeLanguage)
    if (typeof fields === 'string') {
        return { error: tErr(fields) }
    }
    const existingDetail = getRecipe(id)
    if (!existingDetail) {
        return { error: tErr('recipeNotFound') }
    }
    for (const childId of fields.components) {
        if (childId === id) {
            return { error: tErr('componentSelfReference') }
        }
        if (wouldCreateCycle(id, childId)) {
            return { error: tErr('componentCycle') }
        }
    }
    const mergedTitle = mergeForActiveLocale(
        existingDetail.title,
        fields.title,
        activeLanguage,
    )
    if (Object.keys(mergedTitle).length === 0) {
        return { error: tErr('titleRequired') }
    }
    const mergedNotes = mergeForActiveLocale(
        existingDetail.notes,
        fields.notes,
        activeLanguage,
    )
    const existingStepTexts = new Map<RecipeStepId, LocaleMap>()
    for (const step of existingDetail.steps) {
        existingStepTexts.set(step.id, step.text)
    }
    db.transaction(() => {
        fields.ingredients = resolveOrCreateIngredients(
            fields.ingredients,
            activeLanguage,
        )
        db.update(recipes)
            .set({
                cuisineKey: fields.cuisineKey,
                activeTimeMinutes: fields.activeTimeMinutes,
                waitTimeMinutes: fields.waitTimeMinutes,
                isCompleteMeal: fields.isCompleteMeal,
                updatedAt: new Date(),
            })
            .where(eq(recipes.id, id))
            .run()
        writeRecipeTranslationUnit(id, 'title', mergedTitle)
        writeRecipeTranslationUnit(id, 'notes', mergedNotes)
        writeChildRows(id, fields, 'replace', existingStepTexts)
    })
    return { success: tForm('saved') }
}

/**
 * Build the locale map to write for a single translatable field, given:
 *   - the existing map persisted in the DB,
 *   - the form's partial map (carrying only the active locale's new value, or
 *     empty if the user cleared it),
 *   - the active locale.
 *
 * Non-active locales are preserved from the existing map. The active locale
 * is set to the new value if non-empty, otherwise removed.
 */
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

export async function copyRecipeAction(data: FormData): Promise<void> {
    await requireSetupOrSession()
    const sourceId = parseRecipeId(readString(data, 'id'))
    if (!sourceId) {
        redirect('/recipes')
    }
    const sourceDetail = getRecipe(sourceId)
    if (!sourceDetail) {
        redirect('/recipes')
    }
    const sourceIngredients = db
        .select()
        .from(recipeIngredients)
        .where(eq(recipeIngredients.recipeId, sourceId))
        .all()
    const sourceSteps = sourceDetail.steps
    let newId: RecipeId | undefined
    db.transaction(() => {
        const inserted = db
            .insert(recipes)
            .values({
                cuisineKey: sourceDetail.cuisineKey,
                activeTimeMinutes: sourceDetail.activeTimeMinutes,
                waitTimeMinutes: sourceDetail.waitTimeMinutes,
                isCompleteMeal: sourceDetail.isCompleteMeal,
                source: 'manual',
                sourceIdentifier: null,
            })
            .returning({ id: recipes.id })
            .get()
        const id = inserted.id
        newId = id
        writeRecipeTranslationUnit(id, 'title', sourceDetail.title)
        writeRecipeTranslationUnit(id, 'notes', sourceDetail.notes)
        if (sourceIngredients.length) {
            db.insert(recipeIngredients)
                .values(
                    sourceIngredients.map((row) => ({
                        recipeId: id,
                        position: row.position,
                        amount: row.amount,
                        unit: row.unit,
                        name: row.name,
                        ingredientId: row.ingredientId,
                    })),
                )
                .run()
        }
        if (sourceSteps.length) {
            const inserted = db
                .insert(recipeSteps)
                .values(
                    sourceSteps.map((row) => ({
                        recipeId: id,
                        position: row.position,
                    })),
                )
                .returning({
                    id: recipeSteps.id,
                    position: recipeSteps.position,
                })
                .all()
            inserted.sort((a, b) => a.position - b.position)
            const sortedSource = [...sourceSteps].sort(
                (a, b) => a.position - b.position,
            )
            for (const [i, row] of inserted.entries()) {
                writeRecipeStepTranslation(row.id, sortedSource[i].text)
            }
        }
    })
    redirect(newId ? `/recipes/${newId}` : '/recipes')
}

export async function deleteRecipeAction(
    _prev: RecipeFormState,
    data: FormData,
): Promise<RecipeFormState> {
    await requireSetupOrSession()
    const tErr = await getTranslations('errors')
    const id = parseRecipeId(readString(data, 'id'))
    if (!id) {
        return { error: tErr('invalidRecipe') }
    }
    const locale = await resolveLocale()
    const referencing = findRecipesReferencing(id)
    if (referencing.length > 0) {
        const titles = referencing
            .map((r) => resolveText(r.title, locale)?.text ?? '(?)')
            .join(', ')
        return {
            error: tErr('recipeReferencedByComposites', { titles }),
        }
    }
    db.transaction(() => {
        deleteRecipeTranslationGroups(id)
        db.delete(recipes).where(eq(recipes.id, id)).run()
    })
    redirect('/recipes')
}
