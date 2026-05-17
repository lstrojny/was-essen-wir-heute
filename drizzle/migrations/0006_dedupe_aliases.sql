-- Dedupe ingredient aliases so the same string never owns two rows across
-- the catalog. Strategy: keep the row with the smallest UUIDv7 id per
-- normalised alias (UUIDv7 is time-ordered, so this keeps the oldest
-- definition), drop the rest.
--
-- Normalisation here uses SQLite's lower() which is ASCII-only. Aliases
-- that differ only by non-ASCII case (e.g. "Öl" vs "öl") will not be
-- caught by this pass — application-level NFC + locale lower-case
-- catches those at the boundary going forward.
DELETE FROM `ingredient_aliases`
WHERE `id` NOT IN (
    SELECT MIN(`id`)
    FROM `ingredient_aliases`
    GROUP BY lower(`alias`)
);--> statement-breakpoint
CREATE UNIQUE INDEX `ingredient_aliases_alias_global_unique` ON `ingredient_aliases` (lower(`alias`));
