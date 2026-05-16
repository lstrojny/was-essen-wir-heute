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
    type IngredientAliasId,
    type IngredientCountUnitId,
    type IngredientId,
    newIngredientAliasId,
    newIngredientCountUnitId,
    newIngredientId,
    newUserId,
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

export const centralIngredients = sqliteTable('central_ingredients', {
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

export const centralIngredientAliases = sqliteTable(
    'central_ingredient_aliases',
    {
        id: text('id')
            .primaryKey()
            .$type<IngredientAliasId>()
            .$defaultFn(() => newIngredientAliasId()),
        centralIngredientId: text('central_ingredient_id')
            .notNull()
            .$type<IngredientId>(),
        alias: text('alias').notNull(),
    },
    (table) => [
        foreignKey({
            columns: [table.centralIngredientId],
            foreignColumns: [centralIngredients.id],
        }).onDelete('cascade'),
        uniqueIndex('central_ingredient_aliases_entry_alias_unique').on(
            table.centralIngredientId,
            sql`lower(${table.alias})`,
        ),
        index('central_ingredient_aliases_alias_idx').on(
            sql`lower(${table.alias})`,
        ),
    ],
)

export const centralIngredientCountUnits = sqliteTable(
    'central_ingredient_count_units',
    {
        id: text('id')
            .primaryKey()
            .$type<IngredientCountUnitId>()
            .$defaultFn(() => newIngredientCountUnitId()),
        centralIngredientId: text('central_ingredient_id')
            .notNull()
            .$type<IngredientId>(),
        unit: text('unit').notNull(),
        gramsPerUnit: real('grams_per_unit').notNull(),
    },
    (table) => [
        foreignKey({
            columns: [table.centralIngredientId],
            foreignColumns: [centralIngredients.id],
        }).onDelete('cascade'),
        uniqueIndex('central_ingredient_count_units_entry_unit_unique').on(
            table.centralIngredientId,
            sql`lower(${table.unit})`,
        ),
    ],
)
