import 'server-only'

import { createOpenAI } from '@ai-sdk/openai'
import { generateObject } from 'ai'
import { z } from 'zod'
import { type Locale, SUPPORTED_LOCALES } from '@/i18n/locale'

const litellm = createOpenAI({
    baseURL: process.env.LITELLM_BASE_URL,
    apiKey: process.env.LITELLM_API_KEY,
})

const DEFAULT_MODEL =
    process.env.LLM_MODEL_TRANSLATE ??
    process.env.LLM_MODEL_CHAT_SYNTHESIS ??
    'anthropic/claude-sonnet-4-6'
const TIMEOUT_MS = 30_000

const LOCALE_NAMES: Record<Locale, string> = {
    de: 'German (de)',
    en: 'English (en)',
}

type FieldKind = 'recipe.title' | 'recipe.notes' | 'recipe.step' | 'ingredient.canonical' | 'ingredient.alias'

const KIND_GUIDANCE: Record<FieldKind, string> = {
    'recipe.title':
        'a recipe title — keep it short, natural-sounding, capitalised in the target language',
    'recipe.notes':
        'free-text cook notes (substitutions, warnings, tips) — preserve tone and any inline emphasis',
    'recipe.step':
        'one numbered cooking step — keep imperative voice, preserve quantities and unit names',
    'ingredient.canonical':
        'a single ingredient name (no qualifiers, no preparation, no quantities) — bare canonical noun in the target language. The first letter MUST be uppercase regardless of the target language (e.g. "Tomato", "Knoblauchzehe", "Olive oil", "Olivenöl").',
    'ingredient.alias':
        'an alternative name for an ingredient — keep it short, a noun phrase, no qualifiers, no quantities. The first letter MUST be uppercase regardless of the target language.',
}

export type TranslateRequest = {
    text: string
    sourceLocale: Locale
    targetLocales: Locale[]
    kind: FieldKind
}

export type TranslateResult = Partial<Record<Locale, string>>

/**
 * Translate one field's text from sourceLocale into each targetLocale. Returns
 * a LocaleMap with one entry per requested target. Throws on LLM error so the
 * caller can surface it to the user.
 */
export async function translateText(
    req: TranslateRequest,
): Promise<TranslateResult> {
    const targets = req.targetLocales.filter(
        (l) => l !== req.sourceLocale && SUPPORTED_LOCALES.includes(l),
    )
    if (targets.length === 0) return {}

    const shape = {} as { [K in Locale]: z.ZodString }
    for (const locale of targets) {
        shape[locale] = z.string().describe(`Translation in ${LOCALE_NAMES[locale]}.`)
    }
    const schema = z.object(shape)

    const guidance = KIND_GUIDANCE[req.kind]
    const targetList = targets.map((l) => LOCALE_NAMES[l]).join(', ')
    const system = [
        `You translate ${guidance}.`,
        `Source language: ${LOCALE_NAMES[req.sourceLocale]}.`,
        `Target language(s): ${targetList}.`,
        'Rules:',
        '- Produce a faithful translation. Do not paraphrase, add commentary, or change the meaning.',
        '- Do not include the source text in the output.',
        '- For ingredient names, output the bare canonical noun only (no qualifiers, no plurals when singular would be natural, no preparation hints).',
        '- For titles, capitalise the target language naturally (e.g. English title case, German sentence case).',
    ].join('\n')

    const { object } = await generateObject({
        model: litellm.chat(DEFAULT_MODEL),
        schema,
        system,
        prompt: req.text,
        abortSignal: AbortSignal.timeout(TIMEOUT_MS),
    })
    return object as TranslateResult
}
