ALTER TABLE `central_ingredients` RENAME TO `ingredients`;--> statement-breakpoint
ALTER TABLE `central_ingredient_aliases` RENAME TO `ingredient_aliases`;--> statement-breakpoint
ALTER TABLE `central_ingredient_count_units` RENAME TO `ingredient_count_units`;--> statement-breakpoint
ALTER TABLE `ingredient_aliases` RENAME COLUMN `central_ingredient_id` TO `ingredient_id`;--> statement-breakpoint
ALTER TABLE `ingredient_count_units` RENAME COLUMN `central_ingredient_id` TO `ingredient_id`;--> statement-breakpoint
ALTER TABLE `recipe_ingredients` RENAME COLUMN `central_ingredient_id` TO `ingredient_id`;
