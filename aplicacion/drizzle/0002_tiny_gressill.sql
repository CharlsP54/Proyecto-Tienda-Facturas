CREATE TABLE `supplier_products` (
	`id` text PRIMARY KEY NOT NULL,
	`supplier_key` text NOT NULL,
	`supplier_name` text NOT NULL,
	`supplier_code` text NOT NULL,
	`supplier_description` text DEFAULT '' NOT NULL,
	`product_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `supplier_products_supplier_code_idx` ON `supplier_products` (`supplier_key`,`supplier_code`);--> statement-breakpoint
CREATE INDEX `supplier_products_product_idx` ON `supplier_products` (`product_id`);--> statement-breakpoint
ALTER TABLE `document_products` ADD `net_unit_cost` text;--> statement-breakpoint
ALTER TABLE `document_products` ADD `units_per_pack` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `document_products` ADD `tax_rate` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `document_products` ADD `supplier_code` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `brand` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `content` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `comparison_unit` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `sale_price` text DEFAULT '' NOT NULL;