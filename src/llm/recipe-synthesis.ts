import { anthropic } from '@ai-sdk/anthropic'
import { generateObject } from 'ai'
import { z } from 'zod'

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
