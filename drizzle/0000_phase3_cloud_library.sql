CREATE TABLE `scan_records` (
  `id` text NOT NULL,
  `owner_id` text NOT NULL,
  `product_name` text NOT NULL,
  `barcode` text,
  `source` text NOT NULL,
  `source_label` text NOT NULL,
  `extracted_text` text NOT NULL DEFAULT '',
  `product_info` text NOT NULL DEFAULT '{}',
  `evidence_data` text NOT NULL DEFAULT '[]',
  `analysis_data` text NOT NULL DEFAULT '{}',
  `is_favorite` integer NOT NULL DEFAULT 0,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(`owner_id`,`id`)
);
--> statement-breakpoint
CREATE INDEX `scan_records_owner_updated_idx` ON `scan_records` (`owner_id`,`updated_at`);
--> statement-breakpoint
CREATE INDEX `scan_records_owner_favorite_idx` ON `scan_records` (`owner_id`,`is_favorite`);
--> statement-breakpoint
CREATE INDEX `scan_records_owner_barcode_idx` ON `scan_records` (`owner_id`,`barcode`);
--> statement-breakpoint
CREATE TABLE `product_comparisons` (
  `id` text NOT NULL,
  `owner_id` text NOT NULL,
  `name` text NOT NULL,
  `left_scan_id` text NOT NULL,
  `right_scan_id` text NOT NULL,
  `comparison_data` text NOT NULL DEFAULT '{}',
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(`owner_id`,`id`)
);
--> statement-breakpoint
CREATE INDEX `product_comparisons_owner_updated_idx` ON `product_comparisons` (`owner_id`,`updated_at`);
