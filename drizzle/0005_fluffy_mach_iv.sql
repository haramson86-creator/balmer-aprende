CREATE TABLE `family_invites` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`email` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `family_members` (
	`owner` text NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`owner`, `user_id`)
);
--> statement-breakpoint
CREATE INDEX `family_members_user` ON `family_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `family_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `parent_access_sessions` ADD `email` text;