import { sql } from 'drizzle-orm'
import {
    foreignKey,
    index,
    integer,
    real,
    sqliteTable,
    text,
    uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import {
    type CuisineKey,
    type IngredientAliasId,
    type IngredientCountUnitId,
    type IngredientId,
    newIngredientAliasId,
    newIngredientCountUnitId,
    newIngredientId,
    newRecipeComponentId,
    newRecipeId,
    newRecipeIngredientId,
    newRecipeRatingId,
    newRecipeStepId,
    newUserId,
    type RecipeComponentId,
    type RecipeId,
    type RecipeIngredientId,
    type RecipeRatingId,
    type RecipeStepId,
    type SessionId,
    type UserId,
} from './ids'

const timestampMs = (name: string) => integer(name, { mode: 'timestamp_ms' })

export const users = sqliteTable(
    'users',
    {
        id: text('id')
            .primaryKey()
            .$type<UserId>()
            .$defaultFn(() => newUserId()),
        email: text('email').notNull(),
        displayName: text('display_name').notNull(),
        passwordHash: text('password_hash').notNull(),
        role: text('role', { enum: ['admin', 'user'] }).notNull(),
        language: text('language', { enum: ['de', 'en'] }).notNull(),
        createdAt: timestampMs('created_at')
            .notNull()
            .default(sql`(unixepoch() * 1000)`),
        updatedAt: timestampMs('updated_at')
            .notNull()
            .default(sql`(unixepoch() * 1000)`),
    },
    (table) => [uniqueIndex('users_email_unique').on(table.email)],
)

export const sessions = sqliteTable(
    'sessions',
    {
        id: text('id').primaryKey().$type<SessionId>(),
        userId: text('user_id').notNull().$type<UserId>(),
        expiresAt: timestampMs('expires_at').notNull(),
        lastUsedAt: timestampMs('last_used_at').notNull(),
        createdAt: timestampMs('created_at')
            .notNull()
            .default(sql`(unixepoch() * 1000)`),
        userAgent: text('user_agent'),
    },
    (table) => [
        foreignKey({
            columns: [table.userId],
            foreignColumns: [users.id],
        }).onDelete('cascade'),
        index('sessions_user_id_idx').on(table.userId),
    ],
)

export const ingredients = sqliteTable('ingredients', {
    id: text('id')
        .primaryKey()
        .$type<IngredientId>()
        .$defaultFn(() => newIngredientId()),
    canonicalDe: text('canonical_de'),
    canonicalEn: text('canonical_en'),
    role: text('role', {
        enum: ['starch', 'vegetable', 'protein', 'none'],
    }).notNull(),
    density: real('density'),
    notes: text('notes'),
    createdAt: timestampMs('created_at')
        .notNull()
        .default(sql`(unixepoch() * 1000)`),
    updatedAt: timestampMs('updated_at')
        .notNull()
        .default(sql`(unixepoch() * 1000)`),
})

export const ingredientAliases = sqliteTable(
    'ingredient_aliases',
    {
        id: text('id')
            .primaryKey()
            .$type<IngredientAliasId>()
            .$defaultFn(() => newIngredientAliasId()),
        ingredientId: text('ingredient_id')
            .notNull()
            .$type<IngredientId>(),
        alias: text('alias').notNull(),
    },
    (table) => [
        foreignKey({
            columns: [table.ingredientId],
            foreignColumns: [ingredients.id],
        }).onDelete('cascade'),
        uniqueIndex('central_ingredient_aliases_entry_alias_unique').on(
            table.ingredientId,
            sql`lower(${table.alias})`,
        ),
        index('central_ingredient_aliases_alias_idx').on(
            sql`lower(${table.alias})`,
        ),
    ],
)

export const ingredientCountUnits = sqliteTable(
    'ingredient_count_units',
    {
        id: text('id')
            .primaryKey()
            .$type<IngredientCountUnitId>()
            .$defaultFn(() => newIngredientCountUnitId()),
        ingredientId: text('ingredient_id')
            .notNull()
            .$type<IngredientId>(),
        unit: text('unit').notNull(),
        gramsPerUnit: real('grams_per_unit').notNull(),
    },
    (table) => [
        foreignKey({
            columns: [table.ingredientId],
            foreignColumns: [ingredients.id],
        }).onDelete('cascade'),
        uniqueIndex('central_ingredient_count_units_entry_unit_unique').on(
            table.ingredientId,
            sql`lower(${table.unit})`,
        ),
    ],
)

export const cuisines = sqliteTable('cuisines', {
    key: text('key').primaryKey().$type<CuisineKey>(),
    labelDe: text('label_de').notNull(),
    labelEn: text('label_en').notNull(),
})

export const recipes = sqliteTable(
    'recipes',
    {
        id: text('id')
            .primaryKey()
            .$type<RecipeId>()
            .$defaultFn(() => newRecipeId()),
        titleDe: text('title_de'),
        titleEn: text('title_en'),
        notesDe: text('notes_de'),
        notesEn: text('notes_en'),
        cuisineKey: text('cuisine_key').notNull().$type<CuisineKey>(),
        activeTimeMinutes: integer('active_time_minutes').notNull(),
        waitTimeMinutes: integer('wait_time_minutes').notNull().default(0),
        isCompleteMeal: integer('is_complete_meal', { mode: 'boolean' })
            .notNull()
            .default(false),
        source: text('source', {
            enum: ['manual', 'spoonacular', 'llm-chat'],
        }).notNull(),
        sourceIdentifier: text('source_identifier'),
        createdAt: timestampMs('created_at')
            .notNull()
            .default(sql`(unixepoch() * 1000)`),
        updatedAt: timestampMs('updated_at')
            .notNull()
            .default(sql`(unixepoch() * 1000)`),
    },
    (table) => [
        foreignKey({
            columns: [table.cuisineKey],
            foreignColumns: [cuisines.key],
        }),
        index('recipes_cuisine_idx').on(table.cuisineKey),
    ],
)

export const recipeSteps = sqliteTable(
    'recipe_steps',
    {
        id: text('id')
            .primaryKey()
            .$type<RecipeStepId>()
            .$defaultFn(() => newRecipeStepId()),
        recipeId: text('recipe_id').notNull().$type<RecipeId>(),
        position: integer('position').notNull(),
        textDe: text('text_de'),
        textEn: text('text_en'),
    },
    (table) => [
        foreignKey({
            columns: [table.recipeId],
            foreignColumns: [recipes.id],
        }).onDelete('cascade'),
        uniqueIndex('recipe_steps_recipe_position_unique').on(
            table.recipeId,
            table.position,
        ),
    ],
)

export const recipeIngredients = sqliteTable(
    'recipe_ingredients',
    {
        id: text('id')
            .primaryKey()
            .$type<RecipeIngredientId>()
            .$defaultFn(() => newRecipeIngredientId()),
        recipeId: text('recipe_id').notNull().$type<RecipeId>(),
        position: integer('position').notNull(),
        amount: real('amount'),
        unit: text('unit'),
        name: text('name').notNull(),
        ingredientId: text('ingredient_id').$type<IngredientId>(),
    },
    (table) => [
        foreignKey({
            columns: [table.recipeId],
            foreignColumns: [recipes.id],
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.ingredientId],
            foreignColumns: [ingredients.id],
        }).onDelete('set null'),
        uniqueIndex('recipe_ingredients_recipe_position_unique').on(
            table.recipeId,
            table.position,
        ),
    ],
)

export const recipeComponents = sqliteTable(
    'recipe_components',
    {
        id: text('id')
            .primaryKey()
            .$type<RecipeComponentId>()
            .$defaultFn(() => newRecipeComponentId()),
        parentRecipeId: text('parent_recipe_id').notNull().$type<RecipeId>(),
        childRecipeId: text('child_recipe_id').notNull().$type<RecipeId>(),
        position: integer('position').notNull(),
    },
    (table) => [
        foreignKey({
            columns: [table.parentRecipeId],
            foreignColumns: [recipes.id],
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.childRecipeId],
            foreignColumns: [recipes.id],
        }).onDelete('restrict'),
        uniqueIndex('recipe_components_parent_position_unique').on(
            table.parentRecipeId,
            table.position,
        ),
    ],
)

export const spoonacularCache = sqliteTable('spoonacular_cache', {
    cacheKey: text('cache_key').primaryKey(),
    responseJson: text('response_json').notNull(),
    fetchedAt: timestampMs('fetched_at')
        .notNull()
        .default(sql`(unixepoch() * 1000)`),
})

export const spoonacularQuota = sqliteTable('spoonacular_quota', {
    id: integer('id').primaryKey(),
    quotaUsed: real('quota_used'),
    quotaLeft: real('quota_left'),
    quotaRequest: real('quota_request'),
    updatedAt: timestampMs('updated_at')
        .notNull()
        .default(sql`(unixepoch() * 1000)`),
})

export const recipeRatings = sqliteTable(
    'recipe_ratings',
    {
        id: text('id')
            .primaryKey()
            .$type<RecipeRatingId>()
            .$defaultFn(() => newRecipeRatingId()),
        recipeId: text('recipe_id').notNull().$type<RecipeId>(),
        userId: text('user_id').notNull().$type<UserId>(),
        score: integer('score').notNull(),
        createdAt: timestampMs('created_at')
            .notNull()
            .default(sql`(unixepoch() * 1000)`),
        updatedAt: timestampMs('updated_at')
            .notNull()
            .default(sql`(unixepoch() * 1000)`),
    },
    (table) => [
        foreignKey({
            columns: [table.recipeId],
            foreignColumns: [recipes.id],
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.userId],
            foreignColumns: [users.id],
        }).onDelete('cascade'),
        uniqueIndex('recipe_ratings_recipe_user_unique').on(
            table.recipeId,
            table.userId,
        ),
    ],
)
