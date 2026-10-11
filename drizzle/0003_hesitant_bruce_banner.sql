CREATE TABLE `deletion_queue` (
	`object_key` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `deletion_queue_owner` ON `deletion_queue` (`owner`);--> statement-breakpoint
CREATE TABLE `parent_access_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `parent_access_owner` ON `parent_access_sessions` (`owner`);--> statement-breakpoint
CREATE TABLE `parent_pins` (
	`owner` text PRIMARY KEY NOT NULL,
	`pin_hash` text NOT NULL,
	`created_at` text NOT NULL
);
