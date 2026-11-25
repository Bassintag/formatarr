ALTER TABLE `libraries` ADD `scan_cron` text;--> statement-breakpoint
ALTER TABLE `libraries` ADD `watch` integer DEFAULT false NOT NULL;