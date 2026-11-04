ALTER TABLE `products` ADD `inner_units` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `inner_unit_label` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `products_category_name_idx` ON `products` (`category`,`name`);--> statement-breakpoint
CREATE INDEX `products_created_idx` ON `products` (`created_at`,`id`);