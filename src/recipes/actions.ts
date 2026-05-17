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
    type RecipeId,
} from '@/db/ids'
import {
    ingredients,
    recipeComponents,
    recipeIngredients,
    recipeSteps,
    recipes,
} from '@/db/schema'
import { resolveLocale } from '@/i18n/locale'
import { foldForMatch } from '@/ingredients/name-match'
import {
    findDirectChildrenForMany,
    findIngredientByName,
    findRecipesReferencing,
} from './queries'

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

type ParsedStep = { textDe: string | null; textEn: string | null }

function parseSteps(data: FormData): ParsedStep[] | FieldsErrorKey {
    const de = readAllStrings(data, 'stepDe')
    const en = readAllStrings(data, 'stepEn')
    const length = Math.max(de.length, en.length)
    const out: ParsedStep[] = []
    for (let i = 0; i < length; i++) {
        const d = (de[i] ?? '').trim()
        const e = (en[i] ?? '').trim()
        if (d === '' && e === '') {
            continue
        }
        out.push({ textDe: d === '' ? null : d, textEn: e === '' ? null : e })
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
    titleDe: string | null
    titleEn: string | null
    notesDe: string | null
    notesEn: string | null
    cuisineKey: CuisineKey
    activeTimeMinutes: number
    waitTimeMinutes: number
    isCompleteMeal: boolean
    ingredients: ParsedIngredient[]
    steps: ParsedStep[]
    components: RecipeId[]
}

function readFormFields(data: FormData): WriteFields | FieldsErrorKey {
    const titleDe = readOptionalString(data, 'titleDe')
    const titleEn = readOptionalString(data, 'titleEn')
    if (!titleDe && !titleEn) {
        return 'titleRequired'
    }
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
    const steps = parseSteps(data)
    if (!Array.isArray(steps)) {
        return steps
    }
    return {
        titleDe,
        titleEn,
        notesDe: readOptionalString(data, 'notesDe'),
        notesEn: readOptionalString(data, 'notesEn'),
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
    activeLanguage: 'de' | 'en',
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
        const folded = foldForMatch(trimmedName)
        const inserted = db
            .insert(ingredients)
            .values({
                canonicalDe: activeLanguage === 'de' ? trimmedName : null,
                canonicalEn: activeLanguage === 'en' ? trimmedName : null,
                canonicalDeFolded: activeLanguage === 'de' ? folded : null,
                canonicalEnFolded: activeLanguage === 'en' ? folded : null,
                role: 'none',
                density: null,
                notes: null,
            })
            .returning({ id: ingredients.id })
            .get()
        return { ...ing, ingredientId: inserted.id }
    })
}

function writeChildRows(
    id: RecipeId,
    fields: WriteFields,
    mode: 'insert' | 'replace',
) {
    if (mode === 'replace') {
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
        db.insert(recipeSteps)
            .values(
                fields.steps.map((step, position) => ({
                    recipeId: id,
                    position,
                    textDe: step.textDe,
                    textEn: step.textEn,
                })),
            )
            .run()
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
    const fields = readFormFields(data)
    if (typeof fields === 'string') {
        return { error: tErr(fields) }
    }
    const source = readSource(data)
    const sourceIdentifier = readString(data, 'sourceIdentifier') || null
    const activeLanguage = await resolveLocale()
    let newId: RecipeId | undefined
    db.transaction(() => {
        fields.ingredients = resolveOrCreateIngredients(
            fields.ingredients,
            activeLanguage,
        )
        const inserted = db
            .insert(recipes)
            .values({
                titleDe: fields.titleDe,
                titleEn: fields.titleEn,
                notesDe: fields.notesDe,
                notesEn: fields.notesEn,
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
        writeChildRows(id, fields, 'insert')
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
    const fields = readFormFields(data)
    if (typeof fields === 'string') {
        return { error: tErr(fields) }
    }
    const existing = db
        .select({ id: recipes.id })
        .from(recipes)
        .where(eq(recipes.id, id))
        .get()
    if (!existing) {
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
    const activeLanguage = await resolveLocale()
    db.transaction(() => {
        fields.ingredients = resolveOrCreateIngredients(
            fields.ingredients,
            activeLanguage,
        )
        db.update(recipes)
            .set({
                titleDe: fields.titleDe,
                titleEn: fields.titleEn,
                notesDe: fields.notesDe,
                notesEn: fields.notesEn,
                cuisineKey: fields.cuisineKey,
                activeTimeMinutes: fields.activeTimeMinutes,
                waitTimeMinutes: fields.waitTimeMinutes,
                isCompleteMeal: fields.isCompleteMeal,
                updatedAt: new Date(),
            })
            .where(eq(recipes.id, id))
            .run()
        writeChildRows(id, fields, 'replace')
    })
    return { success: tForm('saved') }
}

export async function copyRecipeAction(data: FormData): Promise<void> {
    await requireSetupOrSession()
    const sourceId = parseRecipeId(readString(data, 'id'))
    if (!sourceId) {
        redirect('/recipes')
    }
    const source = db
        .select()
        .from(recipes)
        .where(eq(recipes.id, sourceId))
        .get()
    if (!source) {
        redirect('/recipes')
    }
    const sourceIngredients = db
        .select()
        .from(recipeIngredients)
        .where(eq(recipeIngredients.recipeId, sourceId))
        .all()
    const sourceSteps = db
        .select()
        .from(recipeSteps)
        .where(eq(recipeSteps.recipeId, sourceId))
        .all()
    let newId: RecipeId | undefined
    db.transaction(() => {
        const inserted = db
            .insert(recipes)
            .values({
                titleDe: source.titleDe,
                titleEn: source.titleEn,
                notesDe: source.notesDe,
                notesEn: source.notesEn,
                cuisineKey: source.cuisineKey,
                activeTimeMinutes: source.activeTimeMinutes,
                waitTimeMinutes: source.waitTimeMinutes,
                isCompleteMeal: source.isCompleteMeal,
                source: 'manual',
                sourceIdentifier: null,
            })
            .returning({ id: recipes.id })
            .get()
        const id = inserted.id
        newId = id
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
            db.insert(recipeSteps)
                .values(
                    sourceSteps.map((row) => ({
                        recipeId: id,
                        position: row.position,
                        textDe: row.textDe,
                        textEn: row.textEn,
                    })),
                )
                .run()
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
            .map((r) => {
                const primary = locale === 'de' ? r.titleDe : r.titleEn
                const fallback = locale === 'de' ? r.titleEn : r.titleDe
                return primary ?? fallback ?? '(?)'
            })
            .join(', ')
        return {
            error: tErr('recipeReferencedByComposites', { titles }),
        }
    }
    db.delete(recipes).where(eq(recipes.id, id)).run()
    redirect('/recipes')
}
