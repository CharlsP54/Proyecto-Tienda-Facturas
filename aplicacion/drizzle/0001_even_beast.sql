CREATE TABLE `document_products` (
	`document_id` text NOT NULL,
	`line_id` text NOT NULL,
	`product_id` text NOT NULL,
	`unit_cost` text,
	`promotion` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`document_id`, `line_id`),
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `document_products_product_idx` ON `document_products` (`product_id`,`document_id`);--> statement-breakpoint
CREATE INDEX `documents_updated_idx` ON `documents` (`updated_at`,`id`);