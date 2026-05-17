import 'server-only'

import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import {
    type IngredientId,
    type IngredientsAliasId,
    newIngredientsAliasId,
} from '@/db/ids'
import {
    ingredientLookupFolded,
    ingredientsAliases,
    ingredientsTranslated,
    translatedStrings,
} from '@/db/schema'
import type { LocaleMap } from '@/i18n/locale'
import { deleteGroup, newGroup, writeGroup } from '@/i18n/translations'

/**
 * Upsert/clear the canonical translation group for an ingredient. Preserves
 * other-locale values: pass the post-merge LocaleMap; this helper writes it
 * verbatim and rebuilds the lookup-folded shadow for this ingredient.
 */
export function writeIngredientCanonical(
    ingredientId: IngredientId,
    canonical: LocaleMap,
): void {
    const hasAny = Object.keys(canonical).length > 0
    const existing = db
        .select({ groupId: ingredientsTranslated.translatedStringId })
        .from(ingredientsTranslated)
        .where(
            and(
                eq(ingredientsTranslated.ingredientId, ingredientId),
                eq(ingredientsTranslated.unitCode, 'canonical'),
            ),
        )
        .get()
    if (!hasAny) {
        if (existing) {
            db.delete(ingredientsTranslated)
                .where(
                    and(
                        eq(ingredientsTranslated.ingredientId, ingredientId),
                        eq(ingredientsTranslated.unitCode, 'canonical'),
                    ),
                )
                .run()
            deleteGroup(existing.groupId)
        }
        rebuildIngredientLookupFolded(ingredientId)
        return
    }
    if (existing) {
        deleteGroup(existing.groupId)
        writeGroup(existing.groupId, canonical)
    } else {
        const groupId = newGroup()
        db.insert(ingredientsTranslated)
            .values({
                ingredientId,
                unitCode: 'canonical',
                translatedStringId: groupId,
            })
            .run()
        writeGroup(groupId, canonical)
    }
    rebuildIngredientLookupFolded(ingredientId)
}

/**
 * Upsert one alias group for an ingredient. If `existingId` is provided and
 * the row exists, replace its locale rows in place. Otherwise mint a new
 * group + alias row. An empty LocaleMap deletes the alias (when existingId
 * is provided) or no-ops (when null). Rebuilds the lookup-folded shadow.
 */
export function writeIngredientAliasGroup(
    ingredientId: IngredientId,
    existingId: IngredientsAliasId | null,
    text: LocaleMap,
): IngredientsAliasId | null {
    if (Object.keys(text).length === 0) {
        if (existingId) {
            deleteIngredientAliasById(existingId)
            rebuildIngredientLookupFolded(ingredientId)
        }
        return null
    }
    if (existingId) {
        const existing = db
            .select({ groupId: ingredientsAliases.translatedStringId })
            .from(ingredientsAliases)
            .where(eq(ingredientsAliases.id, existingId))
            .get()
        if (existing) {
            deleteGroup(existing.groupId)
            writeGroup(existing.groupId, text)
            rebuildIngredientLookupFolded(ingredientId)
            return existingId
        }
    }
    const newAliasId = newIngredientsAliasId()
    const groupId = newGroup()
    writeGroup(groupId, text)
    db.insert(ingredientsAliases)
        .values({
            id: newAliasId,
            ingredientId,
            translatedStringId: groupId,
        })
        .run()
    rebuildIngredientLookupFolded(ingredientId)
    return newAliasId
}

export function deleteIngredientAliasById(
    id: IngredientsAliasId,
): IngredientId | null {
    const existing = db
        .select({
            groupId: ingredientsAliases.translatedStringId,
            ingredientId: ingredientsAliases.ingredientId,
        })
        .from(ingredientsAliases)
        .where(eq(ingredientsAliases.id, id))
        .get()
    if (!existing) return null
    db.delete(ingredientsAliases).where(eq(ingredientsAliases.id, id)).run()
    deleteGroup(existing.groupId)
    return existing.ingredientId
}

/**
 * Delete all canonical + alias translation groups for an ingredient. Used
 * by ingredient-delete (the FK cascade removes the join rows; this function
 * cleans up the orphaned translated_strings groups).
 */
export function deleteAllIngredientTranslations(
    ingredientId: IngredientId,
): void {
    const canonicalLinks = db
        .select({ groupId: ingredientsTranslated.translatedStringId })
        .from(ingredientsTranslated)
        .where(eq(ingredientsTranslated.ingredientId, ingredientId))
        .all()
    for (const l of canonicalLinks) deleteGroup(l.groupId)
    const aliasLinks = db
        .select({ groupId: ingredientsAliases.translatedStringId })
        .from(ingredientsAliases)
        .where(eq(ingredientsAliases.ingredientId, ingredientId))
        .all()
    for (const l of aliasLinks) deleteGroup(l.groupId)
}

/**
 * Recompute `ingredient_lookup_folded` rows for one ingredient. Deletes
 * existing rows for this ingredient, then re-inserts from its canonical
 * and alias translated_strings via INSERT OR IGNORE (so legitimate
 * intra-ingredient locale collisions — e.g. canonical_de "Pasta" and
 * canonical_en "Pasta" folding to the same value — become a single shadow
 * row instead of failing). Cross-ingredient collisions are caught upstream
 * via the conflict check before write.
 */
export function rebuildIngredientLookupFolded(
    ingredientId: IngredientId,
): void {
    db.delete(ingredientLookupFolded)
        .where(eq(ingredientLookupFolded.ingredientId, ingredientId))
        .run()
    const canonical = db
        .select({
            groupId: ingredientsTranslated.translatedStringId,
            locale: translatedStrings.locale,
            stringFolded: translatedStrings.stringFolded,
        })
        .from(ingredientsTranslated)
        .innerJoin(
            translatedStrings,
            eq(translatedStrings.id, ingredientsTranslated.translatedStringId),
        )
        .where(eq(ingredientsTranslated.ingredientId, ingredientId))
        .all()
    for (const row of canonical) {
        db.insert(ingredientLookupFolded)
            .values({
                stringFolded: row.stringFolded,
                kind: 'canonical',
                ingredientId,
                translatedStringId: row.groupId,
                locale: row.locale,
            })
            .onConflictDoNothing()
            .run()
    }
    const aliases = db
        .select({
            groupId: ingredientsAliases.translatedStringId,
            locale: translatedStrings.locale,
            stringFolded: translatedStrings.stringFolded,
        })
        .from(ingredientsAliases)
        .innerJoin(
            translatedStrings,
            eq(translatedStrings.id, ingredientsAliases.translatedStringId),
        )
        .where(eq(ingredientsAliases.ingredientId, ingredientId))
        .all()
    for (const row of aliases) {
        db.insert(ingredientLookupFolded)
            .values({
                stringFolded: row.stringFolded,
                kind: 'alias',
                ingredientId,
                translatedStringId: row.groupId,
                locale: row.locale,
            })
            .onConflictDoNothing()
            .run()
    }
}

export type LookupOwner = {
    ingredientId: IngredientId
    kind: 'canonical' | 'alias'
}

/**
 * Look up the owner (if any) of a folded string in the alias-and-canonical
 * shadow. Returns the owning ingredient id + kind, or null if free. Pass
 * `excludeIngredientId` to ignore self when re-validating during edit
 * (a row owned by the editing ingredient is not a conflict against itself).
 */
export function findFoldedNameOwner(
    folded: string,
    excludeIngredientId: IngredientId | null,
): LookupOwner | null {
    const hit = db
        .select({
            ingredientId: ingredientLookupFolded.ingredientId,
            kind: ingredientLookupFolded.kind,
        })
        .from(ingredientLookupFolded)
        .where(eq(ingredientLookupFolded.stringFolded, folded))
        .get()
    if (!hit) return null
    if (excludeIngredientId && hit.ingredientId === excludeIngredientId) {
        return null
    }
    return { ingredientId: hit.ingredientId, kind: hit.kind }
}
