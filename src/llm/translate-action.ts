'use server'

import { requireSetupOrSession } from '@/auth/guards'
import { isSupportedLocale, type Locale, type LocaleMap } from '@/i18n/locale'
import { translateText } from './translate'

export type TranslateFieldKind =
    | 'recipe.title'
    | 'recipe.notes'
    | 'recipe.step'
    | 'ingredient.canonical'
    | 'ingredient.alias'

export type TranslateActionResult =
    | { ok: true; translations: LocaleMap }
    | { ok: false; error: string }

/**
 * Translate a single field's active-locale value into the specified target
 * locales. The caller (form UI) decides which locales to request based on
 * what's currently missing in the LocaleMap. Server resolves the source
 * locale from the session.
 */
export async function translateFieldAction(input: {
    text: string
    sourceLocale: Locale
    targetLocales: Locale[]
    kind: TranslateFieldKind
}): Promise<TranslateActionResult> {
    await requireSetupOrSession()
    const trimmed = input.text.trim()
    if (!trimmed) {
        return { ok: false, error: 'empty source text' }
    }
    if (!isSupportedLocale(input.sourceLocale)) {
        return { ok: false, error: 'invalid source locale' }
    }
    const targets = input.targetLocales.filter(isSupportedLocale)
    if (targets.length === 0) {
        return { ok: true, translations: {} }
    }
    try {
        const translations = await translateText({
            text: trimmed,
            sourceLocale: input.sourceLocale,
            targetLocales: targets,
            kind: input.kind,
        })
        return { ok: true, translations }
    } catch (err) {
        return {
            ok: false,
            error: err instanceof Error ? err.message : String(err),
        }
    }
}
