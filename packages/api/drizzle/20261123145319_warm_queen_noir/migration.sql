CREATE TABLE `files` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`library_id` integer NOT NULL,
	`path` text NOT NULL,
	`size` integer NOT NULL,
	`media_info` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`ignored` integer DEFAULT false NOT NULL,
	CONSTRAINT `fk_files_library_id_libraries_id_fk` FOREIGN KEY (`library_id`) REFERENCES `libraries`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `integrations` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`base_url` text NOT NULL,
	`api_key` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`file_id` integer NOT NULL,
	`rule_id` integer NOT NULL,
	`worker_id` integer,
	`status` text DEFAULT 'queued' NOT NULL,
	`progress` real DEFAULT 0 NOT NULL,
	`error` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	CONSTRAINT `fk_jobs_file_id_files_id_fk` FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_jobs_rule_id_rules_id_fk` FOREIGN KEY (`rule_id`) REFERENCES `rules`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_jobs_worker_id_workers_id_fk` FOREIGN KEY (`worker_id`) REFERENCES `workers`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `libraries` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`name` text NOT NULL,
	`path` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `library_integrations` (
	`library_id` integer NOT NULL,
	`integration_id` integer NOT NULL,
	CONSTRAINT `library_integrations_pk` PRIMARY KEY(`library_id`, `integration_id`),
	CONSTRAINT `fk_library_integrations_library_id_libraries_id_fk` FOREIGN KEY (`library_id`) REFERENCES `libraries`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_library_integrations_integration_id_integrations_id_fk` FOREIGN KEY (`integration_id`) REFERENCES `integrations`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`library_id` integer NOT NULL,
	`name` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`position` integer NOT NULL,
	`conditions` text NOT NULL,
	`actions` text NOT NULL,
	CONSTRAINT `fk_rules_library_id_libraries_id_fk` FOREIGN KEY (`library_id`) REFERENCES `libraries`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `workers` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`status` text DEFAULT 'offline' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`capabilities` text NOT NULL,
	`path_mappings` text DEFAULT '[]' NOT NULL,
	`last_seen_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `files_library_path_idx` ON `files` (`library_id`,`path`);--> statement-breakpoint
CREATE INDEX `files_status_idx` ON `files` (`status`);--> statement-breakpoint
CREATE INDEX `jobs_file_idx` ON `jobs` (`file_id`);--> statement-breakpoint
CREATE INDEX `jobs_status_idx` ON `jobs` (`status`);--> statement-breakpoint
CREATE INDEX `jobs_worker_idx` ON `jobs` (`worker_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `rules_library_position_idx` ON `rules` (`library_id`,`position`);