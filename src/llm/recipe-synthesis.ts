import { createOpenAI } from '@ai-sdk/openai'
import { generateObject, type ModelMessage, stepCountIs, streamText } from 'ai'
import { z } from 'zod'
import {
    optionalLocaleMapSchema,
    requiredLocaleMapSchema,
} from '@/i18n/translatable'
import {
    ALWAYS_CLIENT_TOOL_DEFS,
    type ChatTools,
    DETAIL_PAGE_CLIENT_TOOL_DEFS,
} from '@/llm/tools'
import type { RecipeDetail as SpoonacularRecipe } from '@/spoonacular/types'

const litellm = createOpenAI({
    baseURL: process.env.LITELLM_BASE_URL,
    apiKey: process.env.LITELLM_API_KEY,
})

const DEFAULT_MODEL =
    process.env.LLM_MODEL_CHAT_SYNTHESIS ?? 'anthropic/claude-sonnet-4-6'
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
    text: requiredLocaleMapSchema().describe(
        'Step text per locale; all supported locales required.',
    ),
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
    title: requiredLocaleMapSchema().describe(
        'Recipe title per locale; all supported locales required.',
    ),
    notes: optionalLocaleMapSchema().describe(
        'Optional recipe notes per locale (substitutions, warnings, tips). Omit a locale if empty.',
    ),
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
        model: litellm.chat(DEFAULT_MODEL),
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
        model: litellm.chat(DEFAULT_MODEL),
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

export type PageContext =
    | { pageKind: 'recipes-list' }
    | { pageKind: 'ingredients-list' }
    | {
          pageKind: 'recipe-detail'
          recipe: unknown
      }
    | {
          pageKind: 'ingredient-detail'
          ingredient: unknown
      }
    | { pageKind: 'other'; path?: string }

type RecipeFormCtx = {
    id?: string | null
    title?: { de?: string; en?: string }
    cuisineKey?: string | null
    isCompleteMeal?: boolean
    activeTimeMinutes?: string
    waitTimeMinutes?: string
    ingredients?: Array<unknown>
    steps?: Array<unknown>
}

type IngredientFormCtx = {
    id?: string | null
    canonical?: { de?: string; en?: string }
    role?: string
    density?: string
    aliases?: Array<unknown>
    countUnits?: Array<unknown>
}

function summarizeRecipeForm(r: unknown): string {
    if (typeof r !== 'object' || r === null) return '(no form data)'
    const f = r as RecipeFormCtx
    const id = f.id ?? '(unsaved)'
    const title = f.title?.en || f.title?.de || '(unnamed)'
    return [
        `id=${id}`,
        `title="${title}"`,
        f.cuisineKey ? `cuisine=${f.cuisineKey}` : null,
        f.isCompleteMeal ? 'complete=true' : null,
        f.activeTimeMinutes ? `active=${f.activeTimeMinutes}min` : null,
        f.waitTimeMinutes ? `wait=${f.waitTimeMinutes}min` : null,
        `ingredients=${f.ingredients?.length ?? 0}`,
        `steps=${f.steps?.length ?? 0}`,
    ]
        .filter(Boolean)
        .join(', ')
}

function summarizeIngredientForm(r: unknown): string {
    if (typeof r !== 'object' || r === null) return '(no form data)'
    const f = r as IngredientFormCtx
    const id = f.id ?? '(unsaved)'
    const name = f.canonical?.en || f.canonical?.de || '(unnamed)'
    return [
        `id=${id}`,
        `name="${name}"`,
        f.role ? `role=${f.role}` : null,
        f.density ? `density=${f.density}g/ml` : null,
        f.aliases?.length ? `aliases=${f.aliases.length}` : null,
        f.countUnits?.length ? `countUnits=${f.countUnits.length}` : null,
    ]
        .filter(Boolean)
        .join(', ')
}

function describePageContext(ctx: PageContext): string {
    switch (ctx.pageKind) {
        case 'recipes-list':
            return 'The user is on the recipes list page. Help them search, filter, or design a new recipe. Form-patch tools are NOT available on this page.'
        case 'ingredients-list':
            return 'The user is on the ingredients list page. Help them search the catalog. Form-patch tools are NOT available on this page.'
        case 'recipe-detail':
            return [
                'The user is on a recipe detail page. Open form summary:',
                summarizeRecipeForm(ctx.recipe),
                'If you need the full current state (ingredients, steps, notes, etc.) call `get_recipe` with the id. The DB version is what the user sees unless they made unsaved edits.',
                'You can call `patch_recipe_form` with a sparse patch to update the open form. The user reviews highlighted changes and clicks Save to persist. Do NOT call `patch_recipe_form` unless the user clearly asked for a change. Confirm what you will change in your reply, then call the tool in the same turn.',
                'For ingredient `amount` in the patch: pass the per-1-serving normalised amount; the form scales for display.',
            ].join('\n')
        case 'ingredient-detail':
            return [
                'The user is on an ingredient detail page. Open form summary:',
                summarizeIngredientForm(ctx.ingredient),
                'If you need the full current state (aliases, count units, notes) call `get_ingredient` with the id.',
                'You can call `patch_ingredient_form` with a sparse patch (e.g. add an alias). Always include the FULL replacement list when supplying `aliases` or `countUnits` — existing entries the user wants to keep must be re-included. Do NOT call the tool unless the user clearly asked for a change.',
            ].join('\n')
        case 'other':
            return ctx.path
                ? `The user is on page ${ctx.path}. Form-patch tools are NOT available.`
                : 'The user is not on a list or detail page. Form-patch tools are NOT available.'
    }
}

function buildChatSystemPrompt(
    activeLanguage: 'de' | 'en',
    pageContext: PageContext,
): string {
    const languageName =
        activeLanguage === 'de' ? 'German (de)' : 'English (en)'
    return [
        "You are the persistent AI assistant in a family-recipe app. You answer questions about the user's recipes and ingredients, suggest dishes, and on detail pages you can apply structured changes to the open form.",
        '',
        `Reply in ${languageName} unless the user clearly writes in the other supported language.`,
        '',
        'Current page context:',
        describePageContext(pageContext),
        '',
        'Conversational rules:',
        '- Keep responses short and concrete; one or two short paragraphs at most.',
        '- Ask one or two clarifying questions per turn when the brief is vague; never bury the cook in a wall of questions.',
        '- Do NOT ask about serving count. The app stores per-serving amounts and lets the cook scale on the recipe page, so the question is never useful. Assume 4 servings unless the user volunteers a different number.',
        '- Propose actual dishes by name when the user has given enough signal.',
        "- Stay focused on recipes, ingredients, and the user's catalog. Avoid unrelated tangents.",
        '',
        'Read tools for consulting the catalog (always available):',
        "- 'do I have X?', 'what Italian recipes do I have?', 'which complete meals can I cook?' → call search_recipes",
        "- 'tell me about this recipe' → call get_recipe with the id",
        "- 'what ingredients do I have?', 'show me my proteins', 'do I have ginger?' → call list_ingredients (omit query for a full list, or pass a substring to filter)",
        "- 'what can I make with chicken?' → call list_ingredients with query 'chicken' to resolve the ingredient id, then call get_recipes_using_ingredient",
        "- 'how is this rated?' → call get_recipe_ratings",
        '',
        'DB-write tools (always available, two-step confirmation required):',
        "- 'rate this 4 stars' / 'forget my rating' → set_my_rating, clear_my_rating",
        "- 'rename this recipe', 'set the cuisine to Thai', 'mark this as complete meal' → update_recipe (works on ANY recipe, not just the open one)",
        "- 'change this ingredient role to vegetable', 'add Spring Onion as an alias' anywhere by id → update_ingredient",
        "- 'delete the Old Test ingredient' → delete_ingredient",
        '',
        'Confirmation pattern for every DB-write tool:',
        '1. Call the tool with `confirmed: false`. The result contains either `{ needs_confirmation: true, summary }` (the tool will do something) or `{ needs_confirmation: false, summary }` (nothing to do — relay the summary, do not call again).',
        "2. Render the summary in your reply in plain language and ask the user to confirm (e.g. 'Soll ich das so anwenden?').",
        '3. ONLY after the user explicitly approves ("yes", "ok", "do it", "ja", "mach", "los"), call the SAME tool again with the SAME inputs plus `confirmed: true`.',
        '4. If the user declines, do not call the tool again. Acknowledge and move on.',
        'Never call a DB-write tool with `confirmed: true` on the first turn. Never invent a "yes" on the user\'s behalf.',
        '',
        'Form-patch tools (only on the matching detail page — see page context):',
        "- 'add spring onion as alias', 'change the role to vegetable' (on ingredient detail) → call patch_ingredient_form",
        "- 'make this vegetarian', 'halve the salt', 'use chicken thighs' (on recipe detail) → call patch_recipe_form",
        "These do NOT take a `confirmed` flag — the form's yellow change-highlights plus the user's manual Save button act as the confirmation.",
        '',
        'Creating a new recipe from the conversation (always available):',
        "- When the conversation has converged on a recipe the user wants to add to the catalog (e.g. they say 'save this', 'das speichern', 'add it'), call `open_new_recipe_form` with the structured recipe. This opens the 'new recipe' form pre-filled — the user reviews and clicks Save. The tool DOES NOT write to the database. Provide both German and English titles + step texts. Ingredient `amount` is at `intendedServings` scale (the form normalises on save).",
        '- Do NOT confirm via a separate yes/no turn — the prefilled-form review is itself the confirmation step.',
        '',
        'When a tool returns, summarise what you found or changed in plain language. Never paste raw JSON into your reply. If a tool fails (returns an `error` field), tell the user briefly and suggest a next step.',
        '',
        'Entity links: whenever your reply mentions a recipe or ingredient that you have fetched via a tool (and therefore have its id), render its name as a markdown link to its detail page:',
        '- recipes → `[Title](/recipes/<id>)`',
        '- ingredients → `[Name](/ingredients/<id>)`',
        "Use the display title in the user's active language for the link text (German if the user wrote in German, otherwise English; fall back to the other language if one is missing). Never invent ids — only link entities whose id appeared in a tool result this conversation.",
    ].join('\n')
}

export type ChatTextInput = {
    messages: ModelMessage[]
    activeLanguage: 'de' | 'en'
    abortSignal?: AbortSignal
    tools?: ChatTools
    pageContext: PageContext
}

export function chatAboutRecipe(input: ChatTextInput) {
    const showFormPatchTools =
        input.pageContext.pageKind === 'recipe-detail' ||
        input.pageContext.pageKind === 'ingredient-detail'
    const tools = {
        ...input.tools,
        ...ALWAYS_CLIENT_TOOL_DEFS,
        ...(showFormPatchTools ? DETAIL_PAGE_CLIENT_TOOL_DEFS : {}),
    }
    return streamText({
        model: litellm.chat(DEFAULT_MODEL),
        system: buildChatSystemPrompt(input.activeLanguage, input.pageContext),
        messages: input.messages,
        abortSignal: input.abortSignal,
        tools,
        stopWhen: stepCountIs(8),
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
        model: litellm.chat(DEFAULT_MODEL),
        schema: recipeSchema,
        system: buildSystemPrompt(input.cuisineKeys, input.activeLanguage),
        messages: [...input.messages, finalInstruction],
        abortSignal: combineSignals(input.abortSignal),
    })
    return object
}
