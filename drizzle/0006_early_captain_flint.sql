ALTER TABLE `lessons` ADD `archived_at` text;--> statement-breakpoint
ALTER TABLE `materials` ADD `content_hash` text;--> statement-breakpoint
ALTER TABLE `materials` ADD `archived_at` text;--> statement-breakpoint
CREATE UNIQUE INDEX `materials_owner_hash` ON `materials` (`owner`,`content_hash`);