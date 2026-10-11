CREATE TABLE `notification_reads` (
	`user_id` text NOT NULL,
	`attempt_id` text NOT NULL,
	`read_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `attempt_id`)
);
