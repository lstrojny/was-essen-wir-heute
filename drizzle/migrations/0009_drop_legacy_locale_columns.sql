-- Phase 4 of the centralised translation refactor: drop the legacy
-- per-locale columns and the old `ingredient_aliases` table now that
-- every read/write path goes through `translated_strings` and the
-- `*_translated` join tables (see migration 0008).
--
-- The old shape is preserved in 0008 long enough for the call-site
-- switchover to land cleanly; this migration removes it.

DROP INDEX IF EXISTS `ingredient_aliases_folded_global_unique`;--> statement-breakpoint
DROP INDEX IF EXISTS `ingredient_aliases_alias_global_unique`;--> statement-breakpoint
DROP INDEX IF EXISTS `ingredients_canonical_de_folded_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `ingredients_canonical_en_folded_idx`;--> statement-breakpoint

DROP TABLE `ingredient_aliases`;--> statement-breakpoint

ALTER TABLE `recipes` DROP COLUMN `title_de`;--> statement-breakpoint
ALTER TABLE `recipes` DROP COLUMN `title_en`;--> statement-breakpoint
ALTER TABLE `recipes` DROP COLUMN `notes_de`;--> statement-breakpoint
ALTER TABLE `recipes` DROP COLUMN `notes_en`;--> statement-breakpoint

ALTER TABLE `recipe_steps` DROP COLUMN `text_de`;--> statement-breakpoint
ALTER TABLE `recipe_steps` DROP COLUMN `text_en`;--> statement-breakpoint

ALTER TABLE `ingredients` DROP COLUMN `canonical_de`;--> statement-breakpoint
ALTER TABLE `ingredients` DROP COLUMN `canonical_en`;--> statement-breakpoint
ALTER TABLE `ingredients` DROP COLUMN `canonical_de_folded`;--> statement-breakpoint
ALTER TABLE `ingredients` DROP COLUMN `canonical_en_folded`;--> statement-breakpoint

ALTER TABLE `cuisines` DROP COLUMN `label_de`;--> statement-breakpoint
ALTER TABLE `cuisines` DROP COLUMN `label_en`;
