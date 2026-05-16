import { sql } from 'drizzle-orm'
import {
    foreignKey,
    index,
    integer,
    sqliteTable,
    text,
    uniqueIndex,
} from 'drizzle-orm/sqlite-core'

const timestampMs = (name: string) => integer(name, { mode: 'timestamp_ms' })

export const users = sqliteTable(
    'users',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
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
        id: text('id').primaryKey(),
        userId: integer('user_id').notNull(),
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
