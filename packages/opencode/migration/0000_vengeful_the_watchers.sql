CREATE TABLE `project` (
	`id` text PRIMARY KEY NOT NULL,
	`worktree` text NOT NULL,
	`vcs` text,
	`name` text,
	`icon_url` text,
	`icon_color` text,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL,
	`time_initialized` integer,
	`sandboxes` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `message` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`data` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `message_session_idx` ON `message` (`session_id`);--> statement-breakpoint
CREATE TABLE `part` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`session_id` text NOT NULL,
	`data` text NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `message`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `part_message_idx` ON `part` (`message_id`);--> statement-breakpoint
CREATE INDEX `part_session_idx` ON `part` (`session_id`);--> statement-breakpoint
CREATE TABLE `permission` (
	`project_id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `session_diff` (
	`session_id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`parent_id` text,
	`slug` text NOT NULL,
	`directory` text NOT NULL,
	`title` text NOT NULL,
	`version` text NOT NULL,
	`share_url` text,
	`summary_additions` integer,
	`summary_deletions` integer,
	`summary_files` integer,
	`summary_diffs` text,
	`revert_message_id` text,
	`revert_part_id` text,
	`revert_snapshot` text,
	`revert_diff` text,
	`permission` text,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL,
	`time_compacting` integer,
	`time_archived` integer,
	FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `session_project_idx` ON `session` (`project_id`);--> statement-breakpoint
CREATE INDEX `session_parent_idx` ON `session` (`parent_id`);--> statement-breakpoint
CREATE TABLE `todo` (
	`session_id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `session_share` (
	`session_id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `share` (
	`session_id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL
);
