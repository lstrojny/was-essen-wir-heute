ALTER TABLE `ingredients` ADD COLUMN `canonical_de_folded` text;--> statement-breakpoint
ALTER TABLE `ingredients` ADD COLUMN `canonical_en_folded` text;--> statement-breakpoint
ALTER TABLE `ingredient_aliases` ADD COLUMN `alias_folded` text;--> statement-breakpoint
-- Best-effort initial backfill via SQLite's ASCII lower(). Non-ASCII rows
-- (umlauts, ß, foreign diacritics) get refreshed by the app's startup hook
-- using the JS foldForMatch — same algorithm used at write time.
UPDATE `ingredients` SET `canonical_de_folded` = lower(`canonical_de`);--> statement-breakpoint
UPDATE `ingredients` SET `canonical_en_folded` = lower(`canonical_en`);--> statement-breakpoint
UPDATE `ingredient_aliases` SET `alias_folded` = lower(`alias`);--> statement-breakpoint
CREATE INDEX `ingredients_canonical_de_folded_idx` ON `ingredients` (`canonical_de_folded`);--> statement-breakpoint
CREATE INDEX `ingredients_canonical_en_folded_idx` ON `ingredients` (`canonical_en_folded`);--> statement-breakpoint
CREATE UNIQUE INDEX `ingredient_aliases_folded_global_unique` ON `ingredient_aliases` (`alias_folded`);
