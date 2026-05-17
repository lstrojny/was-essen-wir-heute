import 'server-only'

import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/db'
import {
    newTranslatedStringGroupId,
    type TranslatedStringGroupId,
} from '@/db/ids'
import { translatedStrings } from '@/db/schema'
import { foldForMatch } from '@/ingredients/name-match'
import type { Locale, LocaleMap } from './locale'
import { resolveText, type ResolvedString } from './translatable'

export function newGroup(): TranslatedStringGroupId {
    return newTranslatedStringGroupId()
}

export function readGroup(
    groupId: TranslatedStringGroupId,
    preferred: Locale,
): ResolvedString | null {
    const rows = db
        .select({
            locale: translatedStrings.locale,
            string: translatedStrings.string,
        })
        .from(translatedStrings)
        .where(eq(translatedStrings.id, groupId))
        .all()
    return pickResolved(rows, preferred)
}

export function readAllLocalesByGroup(
    groupIds: TranslatedStringGroupId[],
): Map<TranslatedStringGroupId, LocaleMap> {
    if (groupIds.length === 0) {
        return new Map()
    }
    const rows = db
        .select({
            id: translatedStrings.id,
            locale: translatedStrings.locale,
            string: translatedStrings.string,
        })
        .from(translatedStrings)
        .where(inArray(translatedStrings.id, groupIds))
        .all()
    const out = new Map<TranslatedStringGroupId, LocaleMap>()
    for (const r of rows) {
        const entry = out.get(r.id) ?? {}
        entry[r.locale] = r.string
        out.set(r.id, entry)
    }
    return out
}

export function readGroups(
    groupIds: TranslatedStringGroupId[],
    preferred: Locale,
): Map<TranslatedStringGroupId, ResolvedString> {
    if (groupIds.length === 0) {
        return new Map()
    }
    const rows = db
        .select({
            id: translatedStrings.id,
            locale: translatedStrings.locale,
            string: translatedStrings.string,
        })
        .from(translatedStrings)
        .where(inArray(translatedStrings.id, groupIds))
        .all()
    const byId = new Map<
        TranslatedStringGroupId,
        { locale: Locale; string: string }[]
    >()
    for (const r of rows) {
        const list = byId.get(r.id) ?? []
        list.push({ locale: r.locale, string: r.string })
        byId.set(r.id, list)
    }
    const out = new Map<TranslatedStringGroupId, ResolvedString>()
    for (const [id, locales] of byId) {
        const resolved = pickResolved(locales, preferred)
        if (resolved) {
            out.set(id, resolved)
        }
    }
    return out
}

function pickResolved(
    locales: { locale: Locale; string: string }[],
    preferred: Locale,
): ResolvedString | null {
    if (locales.length === 0) {
        return null
    }
    const map: LocaleMap = {}
    for (const l of locales) {
        map[l.locale] = l.string
    }
    return resolveText(map, preferred)
}

/**
 * Upsert/delete locale rows for a group:
 * - string → upsert
 * - null → delete that locale row
 * - omitted → leave unchanged
 */
export function writeGroup(
    groupId: TranslatedStringGroupId,
    locales: Partial<Record<Locale, string | null>>,
): void {
    const entries = Object.entries(locales) as [
        Locale,
        string | null | undefined,
    ][]
    for (const [locale, value] of entries) {
        if (value === undefined) {
            continue
        }
        if (value === null) {
            db.delete(translatedStrings)
                .where(
                    and(
                        eq(translatedStrings.id, groupId),
                        eq(translatedStrings.locale, locale),
                    ),
                )
                .run()
            continue
        }
        const folded = foldForMatch(value)
        db.insert(translatedStrings)
            .values({
                id: groupId,
                locale,
                string: value,
                stringFolded: folded,
            })
            .onConflictDoUpdate({
                target: [translatedStrings.id, translatedStrings.locale],
                set: {
                    string: value,
                    stringFolded: folded,
                    updatedAt: new Date(),
                },
            })
            .run()
    }
}

export function deleteGroup(groupId: TranslatedStringGroupId): void {
    db.delete(translatedStrings).where(eq(translatedStrings.id, groupId)).run()
}
