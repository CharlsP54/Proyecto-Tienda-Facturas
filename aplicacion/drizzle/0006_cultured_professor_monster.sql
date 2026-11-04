CREATE TABLE `product_aliases` (
	`id` text PRIMARY KEY NOT NULL,
	`supplier_key` text NOT NULL,
	`supplier_name` text NOT NULL,
	`description` text NOT NULL,
	`description_key` text NOT NULL,
	`product_id` text NOT NULL,
	`document_id` text NOT NULL,
	`confirmed_by` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_aliases_supplier_description_product_idx` ON `product_aliases` (`supplier_key`,`description_key`,`product_id`);--> statement-breakpoint
CREATE INDEX `product_aliases_product_idx` ON `product_aliases` (`product_id`);
--> statement-breakpoint
-- Recupera nombres ya revisados, sin cambiar productos ni compras históricas.
INSERT OR IGNORE INTO product_aliases(id,supplier_key,supplier_name,description,description_key,product_id,document_id,confirmed_by,updated_at)
SELECT lower(hex(randomblob(16))),d.supplier_key,d.supplier,json_extract(line.value,'$.description'),lower(trim(json_extract(line.value,'$.description'))),p.product_id,d.id,d.updated_by,d.updated_at
FROM document_products p JOIN documents d ON d.id=p.document_id JOIN json_each(d.data,'$.lines') line ON json_extract(line.value,'$.id')=p.line_id
WHERE d.status='confirmed' AND d.kind='invoice' AND typeof(json_extract(line.value,'$.description'))='text' AND trim(json_extract(line.value,'$.description'))<>'';
