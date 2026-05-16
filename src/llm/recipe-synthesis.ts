import { anthropic } from '@ai-sdk/anthropic'
import { generateObject, type ModelMessage, streamText } from 'ai'
import { z } from 'zod'
import type { RecipeDetail as SpoonacularRecipe } from '@/spoonacular/types'

const DEFAULT_MODEL =
    process.env.LLM_MODEL_CHAT_SYNTHESIS ?? 'claude-sonnet-4-6'
const TIMEOUT_MS = 60_000

const ingredientSchema = z.object({
    name: z
        .string()
        .describe(
            "Ingredient name in the user's active language ONLY (de or en — see system prompt). Never mix languages within a single recipe.",
        ),
    amount: z
        .number()
        .positive()
        .nullable()
        .describe(
            'Amount for the entire recipe at the intended serving count, not per serving. Null for "to taste" ingredients like salt.',
        ),
    unit: z
        .string()
        .nullable()
        .describe(
            'Canonical unit: g, kg, oz, lb, ml, l, tsp, tbsp, cup, piece, clove, slice, leaf, sprig, bunch, can, jar, pinch, dash. Null if no unit (e.g. "1 onion" stored as count "piece").',
        ),
})

const stepSchema = z.object({
    textDe: z.string().nullable().describe('German step text. Required.'),
    textEn: z.string().nullable().describe('English step text. Required.'),
})

export type RecipeSynthesisInput = {
    prompt: string
    activeLanguage: 'de' | 'en'
    cuisineKeys: readonly string[]
    currentRecipe?: SynthesizedRecipe
    abortSignal?: AbortSignal
}

export type SynthesizedRecipe = z.infer<typeof recipeSchema>

const recipeSchema = z.object({
    titleDe: z
        .string()
        .describe('German recipe title. Always populate both languages.'),
    titleEn: z
        .string()
        .describe('English recipe title. Always populate both languages.'),
    notesDe: z
        .string()
        .nullable()
        .describe('Optional German notes (substitutions, warnings, tips).'),
    notesEn: z.string().nullable().describe('Optional English notes.'),
    cuisineKey: z
        .string()
        .describe(
            'A key from the supplied controlled vocabulary of cuisines. Use "other" if nothing fits.',
        ),
    activeTimeMinutes: z
        .number()
        .int()
        .nonnegative()
        .describe('Hands-on cooking and prep time in minutes.'),
    waitTimeMinutes: z
        .number()
        .int()
        .nonnegative()
        .describe(
            'Passive time (marinating, resting, rising, chilling). 0 if none.',
        ),
    isCompleteMeal: z
        .boolean()
        .describe(
            'True when the recipe stands as a full meal on its own (protein + starch + vegetables, or otherwise nutritionally complete). False for sides, sauces, dressings, mixes, individual components like just "mashed potatoes" or "marinade", or anything meant to be served alongside something else.',
        ),
    intendedServings: z
        .number()
        .int()
        .positive()
        .describe(
            'Number of servings the ingredient amounts above are sized for. If the user said "for 4 people" use 4. Otherwise default to a reasonable family size like 2 or 4.',
        ),
    ingredients: z
        .array(ingredientSchema)
        .describe(
            'Ordered list. Amounts are at the intendedServings scale, not per single serving.',
        ),
    steps: z
        .array(stepSchema)
        .describe(
            'Ordered list of preparation steps. Each step must have text in both German and English.',
        ),
})

function buildSystemPrompt(
    cuisineKeys: readonly string[],
    activeLanguage: 'de' | 'en',
): string {
    const languageName =
        activeLanguage === 'de' ? 'German (de)' : 'English (en)'
    return [
        "You convert a user's free-text recipe request or description into a structured recipe.",
        '',
        'Rules:',
        '- Always emit title, notes, and every step in BOTH German (de) and English (en), regardless of the language the user wrote in. Translate accurately; do not omit either.',
        `- Ingredient names go ONLY in the user's active language, which is ${languageName}. Never mix English ingredient names into a German recipe or vice versa. If the user wrote in German, every ingredient name must be in German (e.g. "Zwiebeln", "Knoblauchzehen", "Schweinehackfleisch"); if the user wrote in English, every ingredient name must be in English (e.g. "Onions", "Garlic cloves", "Ground pork"). Translate as needed — do not leave English terms in a German recipe even when "everyone knows" them.`,
        `- Choose \`cuisineKey\` from this controlled vocabulary only: ${cuisineKeys.join(', ')}. If nothing fits, use "other".`,
        '- `intendedServings` is the count the amounts are sized for. If the user specified a number ("for 4 people"), use that. Otherwise default to 4.',
        '- Ingredient amounts are at the intendedServings scale (not per single serving). The app divides on save.',
        '- Use canonical units only: g, kg, oz, lb (mass); ml, l, tsp, tbsp, cup (volume); piece, clove, slice, leaf, sprig, bunch, can, jar, pinch, dash (count). Pick the most natural unit.',
        '- For "to taste" items (salt, pepper), set amount=null and unit=null.',
        '- Active vs wait time: active is hands-on; wait is passive (marinating, resting, rising, chilling). They are stored separately.',
        '- Be concise but complete. Do not invent obscure ingredients; prefer common, easily-available ones unless the user asked for something specific.',
        '',
        'Ingredient names must be the BARE CANONICAL NOUN — no qualifiers describing state, preparation, sourcing, or size.',
        '- DROP form/state qualifiers: fresh, dried, frozen, raw, cooked.',
        '- DROP preparation qualifiers: minced, chopped, diced, sliced, grated, peeled, crushed.',
        '- DROP sourcing/quality qualifiers: organic, free-range, extra-virgin, premium.',
        '- DROP size qualifiers: large, small, medium.',
        '- KEEP qualifiers that change the substance itself: "ground beef" ≠ "beef" (different cut); "coconut milk" ≠ "coconut" (different product); "soy sauce" (single compound name).',
        '- Use the PLURAL form for countable nouns: "Eier" not "Ei", "Zwiebeln" not "Zwiebel", "Tomaten" not "Tomate", "Knoblauchzehen" not "Knoblauchzehe", "Onions" not "Onion", "Tomatoes" not "Tomato". This matches how cooks naturally write ingredient lists. Mass / uncountable nouns stay in their natural form ("Mehl", "Milch", "Salz", "Flour", "Salt").',
        '- Examples: "Fresh parsley, minced" → "Parsley". "1 large yellow onion, finely chopped" → "Onions" (amount 1, unit piece). "Extra-virgin olive oil" → "Olive oil". "Ground cinnamon" → "Cinnamon". "Ground beef" → "Ground beef" (kept — substance differs from "beef"). "Coconut milk" → "Coconut milk" (kept). "5 Eier" → name "Eier", amount 5, unit "piece".',
        '- Preparation instructions ("minced", "chopped") belong in the step text, not in the ingredient name.',
    ].join('\n')
}

function combineSignals(...signals: (AbortSignal | undefined)[]): AbortSignal {
    const real = signals.filter((s): s is AbortSignal => s !== undefined)
    if (real.length === 0) {
        return AbortSignal.timeout(TIMEOUT_MS)
    }
    return AbortSignal.any([...real, AbortSignal.timeout(TIMEOUT_MS)])
}

function buildPrompt(input: RecipeSynthesisInput): string {
    if (!input.currentRecipe) {
        return input.prompt
    }
    return [
        'Here is the current recipe as structured JSON:',
        '```json',
        JSON.stringify(input.currentRecipe, null, 2),
        '```',
        '',
        'Apply this change and return the full modified recipe. Keep fields that should not change unchanged.',
        '',
        'Change request:',
        input.prompt,
    ].join('\n')
}

export async function synthesizeRecipe(
    input: RecipeSynthesisInput,
): Promise<SynthesizedRecipe> {
    const { object } = await generateObject({
        model: anthropic(DEFAULT_MODEL),
        schema: recipeSchema,
        system: buildSystemPrompt(input.cuisineKeys, input.activeLanguage),
        prompt: buildPrompt(input),
        abortSignal: combineSignals(input.abortSignal),
    })
    return object
}

function filterSpoonacularPayload(detail: SpoonacularRecipe) {
    return {
        title: detail.title,
        cuisines: detail.cuisines ?? [],
        servings: detail.servings ?? null,
        readyInMinutes: detail.readyInMinutes ?? null,
        cookingMinutes: detail.cookingMinutes ?? null,
        preparationMinutes: detail.preparationMinutes ?? null,
        extendedIngredients: (detail.extendedIngredients ?? []).map((ing) => ({
            name: ing.name,
            amount: ing.amount ?? null,
            unit: ing.unit ?? null,
            original: ing.original ?? null,
        })),
        analyzedInstructions: (detail.analyzedInstructions ?? []).map(
            (block) => ({
                steps: block.steps.map((s) => ({
                    number: s.number,
                    step: s.step,
                })),
            }),
        ),
    }
}

function buildEnrichmentSystemPrompt(
    cuisineKeys: readonly string[],
    activeLanguage: 'de' | 'en',
): string {
    const languageName =
        activeLanguage === 'de' ? 'German (de)' : 'English (en)'
    return [
        'You enrich an English-only recipe imported from the Spoonacular API into a fully structured bilingual recipe.',
        '',
        'Rules:',
        '- Always emit title, notes (if there are any), and every step in BOTH German (de) and English (en). The English values come from Spoonacular; you translate them into German faithfully.',
        `- Ingredient names go ONLY in the user's active language: ${languageName}. The Spoonacular payload has English names; translate them as needed. Never mix English ingredient names into a German recipe.`,
        `- Choose \`cuisineKey\` from this controlled vocabulary only: ${cuisineKeys.join(', ')}. Prefer the first entry of the payload's \`cuisines\` array if it maps cleanly; otherwise pick based on content. Use "other" only as a last resort.`,
        "- `intendedServings` should match Spoonacular's `servings` field. Ingredient amounts come from the payload at that scale — keep them as-is (the app divides on save).",
        '- Use canonical units only: g, kg, oz, lb (mass); ml, l, tsp, tbsp, cup (volume); piece, clove, slice, leaf, sprig, bunch, can, jar, pinch, dash (count). Normalise Spoonacular\'s unit strings ("cups" → "cup", "Tablespoons" → "tbsp"). For "to taste" or amount-less items set amount=null and unit=null.',
        '- Active vs wait time: scan the instructions and ingredient originals for passive durations ("let rest 1 hour", "soak overnight", "refrigerate 8 hours", "rise for 30 min"). Sum those into `waitTimeMinutes`. Compute `activeTimeMinutes` as the hands-on time only — start from `cookingMinutes + preparationMinutes` if present, else `readyInMinutes` — and SUBTRACT any wait time that was already counted there, so they don\'t double-count. If you cannot tell, treat all of `readyInMinutes` as active.',
        '- Determine `isCompleteMeal`: true if the recipe stands as a full meal on its own; false for sides, sauces, dressings, components.',
        '',
        'Ingredient names must be the BARE CANONICAL NOUN — no qualifiers describing state, preparation, sourcing, or size.',
        '- DROP form/state qualifiers: fresh, dried, frozen, raw, cooked.',
        '- DROP preparation qualifiers: minced, chopped, diced, sliced, grated, peeled, crushed.',
        '- DROP sourcing/quality qualifiers: organic, free-range, extra-virgin, premium.',
        '- DROP size qualifiers: large, small, medium.',
        '- KEEP qualifiers that change the substance: "ground beef" ≠ "beef"; "coconut milk" ≠ "coconut"; compound names like "soy sauce" stay.',
        '- Use the PLURAL form for countable nouns: "Eier" not "Ei", "Zwiebeln" not "Zwiebel", "Onions" not "Onion". Mass / uncountable nouns stay natural ("Mehl", "Milch", "Flour").',
        '- Preparation instructions belong in the step text, not the ingredient name.',
    ].join('\n')
}

export async function enrichSpoonacularImport(input: {
    detail: SpoonacularRecipe
    cuisineKeys: readonly string[]
    activeLanguage: 'de' | 'en'
    abortSignal?: AbortSignal
}): Promise<SynthesizedRecipe> {
    const filtered = filterSpoonacularPayload(input.detail)
    const userPrompt = [
        'Spoonacular returned this recipe (English source):',
        '```json',
        JSON.stringify(filtered, null, 2),
        '```',
        '',
        'Produce the fully enriched bilingual recipe in the required schema. Apply all the rules from the system prompt: translation, cuisine mapping, wait-time extraction, ingredient name conventions, complete-meal flag, unit normalisation.',
    ].join('\n')
    const { object } = await generateObject({
        model: anthropic(DEFAULT_MODEL),
        schema: recipeSchema,
        system: buildEnrichmentSystemPrompt(
            input.cuisineKeys,
            input.activeLanguage,
        ),
        prompt: userPrompt,
        abortSignal: combineSignals(input.abortSignal),
    })
    return object
}

function buildChatSystemPrompt(activeLanguage: 'de' | 'en'): string {
    const languageName =
        activeLanguage === 'de' ? 'German (de)' : 'English (en)'
    return [
        'You help a home cook design a recipe to save to their family recipe catalog. The user will chat with you in natural language; you ask clarifying questions (servings, cuisine, dietary constraints, what is on hand) and propose ideas.',
        '',
        `Reply in ${languageName} unless the user clearly writes in the other supported language.`,
        '',
        'Conversational rules:',
        '- Keep responses short and concrete; one or two short paragraphs at most.',
        '- Ask one or two clarifying questions per turn when the brief is vague; never bury the cook in a wall of questions.',
        '- Propose actual dishes by name when the user has given enough signal. Describe them briefly so the cook can pick or adjust.',
        '- When the user has converged on a recipe and indicates they want to save it, confirm what you understood in one or two sentences and remind them to click the "Save this recipe" button — DO NOT emit a structured recipe yourself. The app handles the structured emit on the save click.',
        '- Stay focused on recipe design. Avoid unrelated tangents.',
    ].join('\n')
}

export type ChatTextInput = {
    messages: ModelMessage[]
    activeLanguage: 'de' | 'en'
    abortSignal?: AbortSignal
}

export function chatAboutRecipe(
    input: ChatTextInput,
): ReturnType<typeof streamText> {
    return streamText({
        model: anthropic(DEFAULT_MODEL),
        system: buildChatSystemPrompt(input.activeLanguage),
        messages: input.messages,
        abortSignal: input.abortSignal,
    })
}

export async function synthesizeRecipeFromMessages(input: {
    messages: ModelMessage[]
    cuisineKeys: readonly string[]
    activeLanguage: 'de' | 'en'
    abortSignal?: AbortSignal
}): Promise<SynthesizedRecipe> {
    const finalInstruction: ModelMessage = {
        role: 'user',
        content:
            'Based on our conversation, emit the final structured recipe now. Apply every rule from the system prompt: both-language titles/notes/steps, ingredient names in my active language, plural form for countable nouns, no qualifiers, canonical units, normalised wait vs active time, intendedServings reflecting our conversation.',
    }
    const { object } = await generateObject({
        model: anthropic(DEFAULT_MODEL),
        schema: recipeSchema,
        system: buildSystemPrompt(input.cuisineKeys, input.activeLanguage),
        messages: [...input.messages, finalInstruction],
        abortSignal: combineSignals(input.abortSignal),
    })
    return object
}
