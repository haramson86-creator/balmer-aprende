CREATE TABLE `lesson_audio` (
	`owner` text NOT NULL,
	`hash` text NOT NULL,
	`object_key` text NOT NULL,
	`created_at` text NOT NULL,
	`lock_until` text NOT NULL,
	`token` text NOT NULL,
	`ready_at` text,
	PRIMARY KEY(`owner`, `hash`)
);
--> statement-breakpoint
CREATE INDEX `lesson_audio_owner` ON `lesson_audio` (`owner`);