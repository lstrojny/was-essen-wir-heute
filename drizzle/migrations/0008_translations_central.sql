-- Phase 1 of the centralised translation refactor
-- (specs/tech/01_persistence.md "Per-language storage"). Adds
-- translated_strings + per-parent join tables + the new ingredients_aliases
-- shape + the ingredient_lookup_folded shadow table. Backfills the central
-- table and join tables from the existing per-locale columns and the old
-- `ingredient_aliases`. Old columns and the old `ingredient_aliases` table
-- stay in place for the dual-write era; they are dropped in migration 0009
-- after the call-site switchover (Phase 2).
--
-- Migration-time translated_string group ids are derived deterministically
-- as "<parent_id>__<unit_code>" so the SQL is debuggable without temp
-- tables. Going forward, app-side writes mint UUIDv7 group ids via
-- newTranslatedStringGroupId in src/db/ids.ts. The mixed shape is opaque
-- at the TS layer (the brand is just a string).
--
-- Folded values are computed via SQLite's ASCII-only lower() during
-- backfill; the startup hook in src/db/index.ts reconciles non-ASCII drift
-- (umlauts, ß, foreign diacritics) using foldForMatch, same pattern as
-- migration 0007.
--
-- ingredient_lookup_folded is created empty here and populated by the
-- startup hook in Phase 2. SQL-only backfill cannot distinguish
-- legitimate intra-ingredient locale-fold collisions (e.g. canonical_de
-- "Pasta" and canonical_en "Pasta" folding to the same value) from real
-- cross-ingredient invariant violations.

CREATE TABLE `translated_strings` (
    `id` text NOT NULL,
    `locale` text NOT NULL,
    `string` text NOT NULL,
    `string_folded` text NOT NULL,
    `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
    `updated_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
    PRIMARY KEY (`id`, `locale`)
);--> statement-breakpoint
CREATE INDEX `translated_strings_string_folded_idx` ON `translated_strings` (`string_folded`);--> statement-breakpoint

CREATE TABLE `recipes_translated` (
    `recipe_id` text NOT NULL,
    `unit_code` text NOT NULL,
    `translated_string_id` text NOT NULL,
    PRIMARY KEY (`recipe_id`, `unit_code`),
    FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint

CREATE TABLE `recipe_steps_translated` (
    `recipe_step_id` text NOT NULL,
    `unit_code` text NOT NULL,
    `translated_string_id` text NOT NULL,
    PRIMARY KEY (`recipe_step_id`, `unit_code`),
    FOREIGN KEY (`recipe_step_id`) REFERENCES `recipe_steps`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint

CREATE TABLE `ingredients_translated` (
    `ingredient_id` text NOT NULL,
    `unit_code` text NOT NULL,
    `translated_string_id` text NOT NULL,
    PRIMARY KEY (`ingredient_id`, `unit_code`),
    FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint

CREATE TABLE `cuisines_translated` (
    `cuisine_key` text NOT NULL,
    `unit_code` text NOT NULL,
    `translated_string_id` text NOT NULL,
    PRIMARY KEY (`cuisine_key`, `unit_code`),
    FOREIGN KEY (`cuisine_key`) REFERENCES `cuisines`(`key`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint

CREATE TABLE `ingredients_aliases` (
    `id` text PRIMARY KEY NOT NULL,
    `ingredient_id` text NOT NULL,
    `translated_string_id` text NOT NULL,
    FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint

CREATE TABLE `ingredient_lookup_folded` (
    `string_folded` text PRIMARY KEY NOT NULL,
    `kind` text NOT NULL,
    `ingredient_id` text NOT NULL,
    `translated_string_id` text NOT NULL,
    `locale` text NOT NULL,
    FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `ingredient_lookup_folded_ingredient_idx` ON `ingredient_lookup_folded` (`ingredient_id`);--> statement-breakpoint

-- ====================================================================
-- Backfill
-- ====================================================================

-- recipes.title -> translated_strings + recipes_translated
INSERT INTO `translated_strings` (`id`, `locale`, `string`, `string_folded`)
SELECT `id` || '__title', 'de', `title_de`, lower(`title_de`)
FROM `recipes` WHERE `title_de` IS NOT NULL;--> statement-breakpoint

INSERT INTO `translated_strings` (`id`, `locale`, `string`, `string_folded`)
SELECT `id` || '__title', 'en', `title_en`, lower(`title_en`)
FROM `recipes` WHERE `title_en` IS NOT NULL;--> statement-breakpoint

INSERT INTO `recipes_translated` (`recipe_id`, `unit_code`, `translated_string_id`)
SELECT `id`, 'title', `id` || '__title'
FROM `recipes`
WHERE `title_de` IS NOT NULL OR `title_en` IS NOT NULL;--> statement-breakpoint

-- recipes.notes
INSERT INTO `translated_strings` (`id`, `locale`, `string`, `string_folded`)
SELECT `id` || '__notes', 'de', `notes_de`, lower(`notes_de`)
FROM `recipes` WHERE `notes_de` IS NOT NULL;--> statement-breakpoint

INSERT INTO `translated_strings` (`id`, `locale`, `string`, `string_folded`)
SELECT `id` || '__notes', 'en', `notes_en`, lower(`notes_en`)
FROM `recipes` WHERE `notes_en` IS NOT NULL;--> statement-breakpoint

INSERT INTO `recipes_translated` (`recipe_id`, `unit_code`, `translated_string_id`)
SELECT `id`, 'notes', `id` || '__notes'
FROM `recipes`
WHERE `notes_de` IS NOT NULL OR `notes_en` IS NOT NULL;--> statement-breakpoint

-- recipe_steps.text
INSERT INTO `translated_strings` (`id`, `locale`, `string`, `string_folded`)
SELECT `id` || '__text', 'de', `text_de`, lower(`text_de`)
FROM `recipe_steps` WHERE `text_de` IS NOT NULL;--> statement-breakpoint

INSERT INTO `translated_strings` (`id`, `locale`, `string`, `string_folded`)
SELECT `id` || '__text', 'en', `text_en`, lower(`text_en`)
FROM `recipe_steps` WHERE `text_en` IS NOT NULL;--> statement-breakpoint

INSERT INTO `recipe_steps_translated` (`recipe_step_id`, `unit_code`, `translated_string_id`)
SELECT `id`, 'text', `id` || '__text'
FROM `recipe_steps`
WHERE `text_de` IS NOT NULL OR `text_en` IS NOT NULL;--> statement-breakpoint

-- ingredients.canonical
INSERT INTO `translated_strings` (`id`, `locale`, `string`, `string_folded`)
SELECT `id` || '__canonical', 'de', `canonical_de`, `canonical_de_folded`
FROM `ingredients` WHERE `canonical_de` IS NOT NULL;--> statement-breakpoint

INSERT INTO `translated_strings` (`id`, `locale`, `string`, `string_folded`)
SELECT `id` || '__canonical', 'en', `canonical_en`, `canonical_en_folded`
FROM `ingredients` WHERE `canonical_en` IS NOT NULL;--> statement-breakpoint

INSERT INTO `ingredients_translated` (`ingredient_id`, `unit_code`, `translated_string_id`)
SELECT `id`, 'canonical', `id` || '__canonical'
FROM `ingredients`
WHERE `canonical_de` IS NOT NULL OR `canonical_en` IS NOT NULL;--> statement-breakpoint

-- cuisines.label (label_de / label_en are NOT NULL today)
INSERT INTO `translated_strings` (`id`, `locale`, `string`, `string_folded`)
SELECT `key` || '__label', 'de', `label_de`, lower(`label_de`)
FROM `cuisines`;--> statement-breakpoint

INSERT INTO `translated_strings` (`id`, `locale`, `string`, `string_folded`)
SELECT `key` || '__label', 'en', `label_en`, lower(`label_en`)
FROM `cuisines`;--> statement-breakpoint

INSERT INTO `cuisines_translated` (`cuisine_key`, `unit_code`, `translated_string_id`)
SELECT `key`, 'label', `key` || '__label'
FROM `cuisines`;--> statement-breakpoint

-- ingredient_aliases (old, language-agnostic) -> ingredients_aliases (new, groups).
-- Option C: assign the alias to whichever locale the ingredient's canonical is
-- populated in (preferring 'de' when both are present, since DE is the primary
-- locale per specs/tech/05_i18n.md).
INSERT INTO `translated_strings` (`id`, `locale`, `string`, `string_folded`)
SELECT
    a.`id` || '__alias',
    CASE WHEN i.`canonical_de` IS NOT NULL THEN 'de' ELSE 'en' END,
    a.`alias`,
    a.`alias_folded`
FROM `ingredient_aliases` a
JOIN `ingredients` i ON i.`id` = a.`ingredient_id`;--> statement-breakpoint

INSERT INTO `ingredients_aliases` (`id`, `ingredient_id`, `translated_string_id`)
SELECT `id`, `ingredient_id`, `id` || '__alias'
FROM `ingredient_aliases`;
