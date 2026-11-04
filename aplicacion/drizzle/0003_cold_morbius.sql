CREATE TABLE `reference_choices` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`reference_date` text NOT NULL,
	`document_id` text NOT NULL,
	`line_id` text NOT NULL,
	`reason` text NOT NULL,
	`chosen_by` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reference_choices_product_date_idx` ON `reference_choices` (`product_id`,`reference_date`);--> statement-breakpoint
CREATE INDEX `reference_choices_document_idx` ON `reference_choices` (`document_id`);