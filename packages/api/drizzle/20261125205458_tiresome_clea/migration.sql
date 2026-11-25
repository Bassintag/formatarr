DELETE FROM `jobs`;--> statement-breakpoint
DELETE FROM `rules`;--> statement-breakpoint
CREATE TABLE `job_rules` (
	`job_id` integer NOT NULL,
	`rule_id` integer NOT NULL,
	CONSTRAINT `job_rules_pk` PRIMARY KEY(`job_id`, `rule_id`),
	CONSTRAINT `fk_job_rules_job_id_jobs_id_fk` FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_job_rules_rule_id_rules_id_fk` FOREIGN KEY (`rule_id`) REFERENCES `rules`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
ALTER TABLE `rules` ADD `type` text NOT NULL;--> statement-breakpoint
ALTER TABLE `rules` ADD `value` text NOT NULL;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`file_id` integer NOT NULL,
	`worker_id` integer,
	`status` text DEFAULT 'queued' NOT NULL,
	`progress` real DEFAULT 0 NOT NULL,
	`error` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	CONSTRAINT `fk_jobs_file_id_files_id_fk` FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_jobs_worker_id_workers_id_fk` FOREIGN KEY (`worker_id`) REFERENCES `workers`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
INSERT INTO `__new_jobs`(`id`, `file_id`, `worker_id`, `status`, `progress`, `error`, `created_at`, `started_at`, `finished_at`) SELECT `id`, `file_id`, `worker_id`, `status`, `progress`, `error`, `created_at`, `started_at`, `finished_at` FROM `jobs`;--> statement-breakpoint
DROP TABLE `jobs`;--> statement-breakpoint
ALTER TABLE `__new_jobs` RENAME TO `jobs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `jobs_file_idx` ON `jobs` (`file_id`);--> statement-breakpoint
CREATE INDEX `jobs_status_idx` ON `jobs` (`status`);--> statement-breakpoint
CREATE INDEX `jobs_worker_idx` ON `jobs` (`worker_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `rules_library_type_idx` ON `rules` (`library_id`,`type`);--> statement-breakpoint
ALTER TABLE `rules` DROP COLUMN `name`;--> statement-breakpoint
ALTER TABLE `rules` DROP COLUMN `conditions`;--> statement-breakpoint
ALTER TABLE `rules` DROP COLUMN `actions`;