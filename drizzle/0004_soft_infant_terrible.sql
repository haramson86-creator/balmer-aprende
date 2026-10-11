CREATE TABLE `native_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`email` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `native_tickets` (
	`ticket_hash` text PRIMARY KEY NOT NULL,
	`challenge` text NOT NULL,
	`owner` text NOT NULL,
	`email` text NOT NULL,
	`expires_at` text NOT NULL
);
