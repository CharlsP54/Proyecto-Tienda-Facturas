CREATE TABLE `audit` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text DEFAULT '' NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`detail` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_created_idx` ON `audit` (`created_at`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`kind` text NOT NULL,
	`supplier` text NOT NULL,
	`supplier_key` text NOT NULL,
	`number` text DEFAULT '' NOT NULL,
	`date` text DEFAULT '' NOT NULL,
	`seller` text DEFAULT '' NOT NULL,
	`total` text DEFAULT '' NOT NULL,
	`data` text NOT NULL,
	`validation` text NOT NULL,
	`related_id` text DEFAULT '' NOT NULL,
	`review_of` text DEFAULT '' NOT NULL,
	`operation_id` text,
	`update_token` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `documents_date_idx` ON `documents` (`date`);--> statement-breakpoint
CREATE INDEX `documents_supplier_idx` ON `documents` (`supplier_key`);--> statement-breakpoint
CREATE INDEX `documents_status_idx` ON `documents` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `documents_confirmed_identity_idx` ON `documents` (`supplier_key`,`kind`,`number`) WHERE "documents"."status" = 'confirmed' AND "documents"."number" <> '';--> statement-breakpoint
CREATE UNIQUE INDEX `documents_operation_idx` ON `documents` (`operation_id`) WHERE "documents"."operation_id" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`size` integer NOT NULL,
	`key` text NOT NULL,
	`sha256` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `files_key_unique` ON `files` (`key`);--> statement-breakpoint
CREATE INDEX `files_document_idx` ON `files` (`document_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `files_document_hash_idx` ON `files` (`document_id`,`sha256`);--> statement-breakpoint
CREATE TABLE `members` (
	`email` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`role` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`barcode` text DEFAULT '' NOT NULL,
	`presentation` text DEFAULT '' NOT NULL,
	`units_per_pack` text DEFAULT '' NOT NULL,
	`tax_rate` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `products_name_idx` ON `products` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `products_barcode_idx` ON `products` (`barcode`) WHERE "products"."barcode" <> '';--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `suppliers_name_key_unique` ON `suppliers` (`name_key`);