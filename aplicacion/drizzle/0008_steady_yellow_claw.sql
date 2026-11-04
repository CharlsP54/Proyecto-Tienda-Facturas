ALTER TABLE `products` ADD `contents_mode` text DEFAULT '' NOT NULL;
--> statement-breakpoint
UPDATE `products` SET `contents_mode` = 'multiple' WHERE `inner_units` <> '' AND `inner_unit_label` <> '';
