CREATE TABLE `account_tokens` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`purpose` text NOT NULL,
	`credential_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_by` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `account_token_user` ON `account_tokens` (`user_id`,`purpose`);--> statement-breakpoint
ALTER TABLE `users` ADD `email_verified_at` integer;