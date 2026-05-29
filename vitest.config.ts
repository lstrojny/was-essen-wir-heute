import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { defineConfig } from 'vitest/config'

/**
 * Build the pre-migrated DB snapshot once when vitest loads its config (in
 * the main process, before any worker thread exists) and inline it as a
 * base64 env var. Workers inherit `process.env` at creation, so by the
 * time `@/db` runs in the worker the snapshot is already in memory — no fs
 * op is needed inside the worker.
 *
 * This avoids the fd-20 collision that Stryker's vitest-runner triggers
 * when any worker-side fs.openSync (drizzle's migrations or a snapshot
 * file read) lands on the same descriptor Stryker uses for IPC and
 * libuv aborts. See `src/db/index.ts` for the consumer.
 */
function buildSnapshotB64(): string {
    const sqlite = new Database(':memory:')
    sqlite.pragma('foreign_keys = ON')
    const db = drizzle({ client: sqlite })
    migrate(db, {
        migrationsFolder: resolve('./drizzle/migrations'),
    })
    const buffer = sqlite.serialize()
    sqlite.close()
    return buffer.toString('base64')
}

export default defineConfig({
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
            'server-only': fileURLToPath(
                new URL('./src/test/server-only-stub.ts', import.meta.url),
            ),
        },
    },
    test: {
        include: ['src/**/*.test.{ts,tsx}'],
        env: {
            DATABASE_PATH: ':memory:',
            TEST_DB_SNAPSHOT_B64: buildSnapshotB64(),
        },
    },
})
