CREATE TABLE `auth_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `child_codes` (
	`code_hash` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`child_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `child_codes_owner_child` ON `child_codes` (`owner`,`child_id`);