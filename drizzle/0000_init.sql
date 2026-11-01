CREATE TABLE `ai_generation_metadata` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_version` text,
	`attempt` integer NOT NULL,
	`duration_ms` integer NOT NULL,
	`prompt_chars` integer NOT NULL,
	`prompt_sha256` text NOT NULL,
	`output_chars` integer,
	`outcome` text NOT NULL,
	`validation_errors` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `ai_jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agm_job_idx` ON `ai_generation_metadata` (`job_id`);--> statement-breakpoint
CREATE TABLE `ai_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`lane` text DEFAULT 'ai' NOT NULL,
	`status` text NOT NULL,
	`dedupe_key` text,
	`input` text NOT NULL,
	`result` text,
	`progress_message` text,
	`error_code` text,
	`error_message` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 3 NOT NULL,
	`run_after` integer NOT NULL,
	`cancel_requested` integer DEFAULT false NOT NULL,
	`heartbeat_at` integer,
	`started_at` integer,
	`finished_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `jobs_status_idx` ON `ai_jobs` (`status`,`lane`,`run_after`);--> statement-breakpoint
CREATE INDEX `jobs_user_idx` ON `ai_jobs` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `jobs_dedupe_idx` ON `ai_jobs` (`user_id`,`dedupe_key`);--> statement-breakpoint
CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `body_measurements` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`weight_kg` real,
	`body_fat_pct` real,
	`waist_cm` real,
	`chest_cm` real,
	`arm_cm` real,
	`hip_cm` real,
	`thigh_cm` real,
	`energy` integer,
	`notes` text,
	`client_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `body_meas_user_date_idx` ON `body_measurements` (`user_id`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `body_meas_client_uq` ON `body_measurements` (`user_id`,`client_id`);--> statement-breakpoint
CREATE TABLE `completed_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`client_id` text NOT NULL,
	`completed_workout_id` text NOT NULL,
	`workout_exercise_id` text,
	`exercise_id` text NOT NULL,
	`substituted_from_id` text,
	`set_index` integer NOT NULL,
	`weight_kg` real,
	`reps` integer,
	`rpe` real,
	`rir` integer,
	`status` text NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`completed_workout_id`) REFERENCES `completed_workouts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cs_client_uq` ON `completed_sets` (`user_id`,`client_id`);--> statement-breakpoint
CREATE INDEX `cs_workout_idx` ON `completed_sets` (`completed_workout_id`);--> statement-breakpoint
CREATE INDEX `cs_user_ex_idx` ON `completed_sets` (`user_id`,`exercise_id`);--> statement-breakpoint
CREATE TABLE `completed_workouts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`client_id` text NOT NULL,
	`plan_version_id` text,
	`workout_session_id` text,
	`title` text NOT NULL,
	`date` text NOT NULL,
	`status` text NOT NULL,
	`unscheduled` integer DEFAULT false NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	`duration_sec` integer,
	`total_volume_kg` real,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cw_client_uq` ON `completed_workouts` (`user_id`,`client_id`);--> statement-breakpoint
CREATE INDEX `cw_user_date_idx` ON `completed_workouts` (`user_id`,`date`);--> statement-breakpoint
CREATE TABLE `equipment_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`data` text DEFAULT '{}' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `exercise_alternatives` (
	`exercise_id` text NOT NULL,
	`alternative_id` text NOT NULL,
	`score` real NOT NULL,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`alternative_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `exercise_alt_pk` ON `exercise_alternatives` (`exercise_id`,`alternative_id`);--> statement-breakpoint
CREATE TABLE `exercise_media` (
	`id` text PRIMARY KEY NOT NULL,
	`exercise_id` text NOT NULL,
	`kind` text NOT NULL,
	`local_path` text,
	`url` text NOT NULL,
	`license` text NOT NULL,
	`embeddable` integer DEFAULT false NOT NULL,
	`verified` integer DEFAULT false NOT NULL,
	`verified_at` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `exercise_media_ex_idx` ON `exercise_media` (`exercise_id`);--> statement-breakpoint
CREATE TABLE `exercise_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`exercise_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`attribution` text NOT NULL,
	`license` text,
	`verified` integer DEFAULT false NOT NULL,
	`verified_at` text,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `exercise_sources_ex_idx` ON `exercise_sources` (`exercise_id`);--> statement-breakpoint
CREATE TABLE `exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`name_fa` text NOT NULL,
	`name_en` text NOT NULL,
	`pattern` text NOT NULL,
	`category` text NOT NULL,
	`level` text NOT NULL,
	`mechanic` text,
	`equipment` text NOT NULL,
	`stress` text NOT NULL,
	`primary_muscles` text NOT NULL,
	`secondary_muscles` text NOT NULL,
	`instructions_en` text NOT NULL,
	`cues_fa` text NOT NULL,
	`mistakes_fa` text NOT NULL,
	`safety_fa` text,
	`is_active` integer DEFAULT true NOT NULL,
	`last_validated_at` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `exercises_pattern_idx` ON `exercises` (`pattern`);--> statement-breakpoint
CREATE TABLE `exported_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`file_name` text,
	`size_bytes` integer,
	`job_id` text,
	`params` text NOT NULL,
	`error` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `reports_user_idx` ON `exported_reports` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `fitness_goals` (
	`user_id` text PRIMARY KEY NOT NULL,
	`data` text DEFAULT '{}' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `food_log_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`client_id` text NOT NULL,
	`date` text NOT NULL,
	`meal_slot` text NOT NULL,
	`plan_version_id` text,
	`planned_meal_id` text,
	`food_id` text,
	`recipe_id` text,
	`label` text NOT NULL,
	`grams` real NOT NULL,
	`kcal` real NOT NULL,
	`protein_g` real NOT NULL,
	`carbs_g` real NOT NULL,
	`fat_g` real NOT NULL,
	`status` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`food_id`) REFERENCES `foods`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fle_client_uq` ON `food_log_entries` (`user_id`,`client_id`);--> statement-breakpoint
CREATE INDEX `fle_user_date_idx` ON `food_log_entries` (`user_id`,`date`);--> statement-breakpoint
CREATE TABLE `food_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`url` text,
	`license` text NOT NULL,
	`notes` text
);
--> statement-breakpoint
CREATE TABLE `foods` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`name_fa` text NOT NULL,
	`name_en` text NOT NULL,
	`category` text NOT NULL,
	`state` text DEFAULT 'na' NOT NULL,
	`serving_g` real NOT NULL,
	`serving_label` text NOT NULL,
	`kcal_100` real NOT NULL,
	`protein_100` real NOT NULL,
	`carbs_100` real NOT NULL,
	`fat_100` real NOT NULL,
	`fiber_100` real,
	`tags` text DEFAULT '[]' NOT NULL,
	`cost_level` integer DEFAULT 2 NOT NULL,
	`source_id` text,
	`confidence` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `food_sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `foods_user_idx` ON `foods` (`user_id`);--> statement-breakpoint
CREATE INDEX `foods_name_idx` ON `foods` (`name_fa`);--> statement-breakpoint
CREATE TABLE `health_constraints` (
	`user_id` text PRIMARY KEY NOT NULL,
	`data` text DEFAULT '{}' NOT NULL,
	`safety_flags` text DEFAULT '{}' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `meal_substitutions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`plan_version_id` text NOT NULL,
	`planned_meal_id` text NOT NULL,
	`date` text,
	`items` text NOT NULL,
	`title` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`plan_version_id`) REFERENCES `nutrition_plan_versions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ms_user_date_idx` ON `meal_substitutions` (`user_id`,`date`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`url` text,
	`dedupe_key` text,
	`read_at` integer,
	`pushed_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notif_user_idx` ON `notifications` (`user_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `notif_dedupe_uq` ON `notifications` (`user_id`,`dedupe_key`);--> statement-breakpoint
CREATE TABLE `nutrition_daily_summaries` (
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`plan_version_id` text,
	`target_kcal` integer,
	`target_protein_g` integer,
	`kcal` real NOT NULL,
	`protein_g` real NOT NULL,
	`carbs_g` real NOT NULL,
	`fat_g` real NOT NULL,
	`entries` integer NOT NULL,
	`planned_meals` integer DEFAULT 0 NOT NULL,
	`logged_meals` integer DEFAULT 0 NOT NULL,
	`completeness` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `nds_pk` ON `nutrition_daily_summaries` (`user_id`,`date`);--> statement-breakpoint
CREATE TABLE `nutrition_plan_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`cycle_id` text,
	`version` integer NOT NULL,
	`status` text NOT NULL,
	`revision_reason` text NOT NULL,
	`previous_version_id` text,
	`target_kcal` integer NOT NULL,
	`protein_g` integer NOT NULL,
	`carbs_g` integer NOT NULL,
	`fat_g` integer NOT NULL,
	`plan` text NOT NULL,
	`profile_snapshot` text NOT NULL,
	`ai_job_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`activated_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`cycle_id`) REFERENCES `program_cycles`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `npv_user_status_idx` ON `nutrition_plan_versions` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `nutrition_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`mode` text DEFAULT 'none' NOT NULL,
	`data` text DEFAULT '{}' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `onboarding_answers` (
	`user_id` text NOT NULL,
	`question_id` text NOT NULL,
	`value` text,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `onb_answers_pk` ON `onboarding_answers` (`user_id`,`question_id`);--> statement-breakpoint
CREATE TABLE `onboarding_progress` (
	`user_id` text PRIMARY KEY NOT NULL,
	`current_question_id` text,
	`completed_at` integer,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `plan_adjustment_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`domain` text NOT NULL,
	`intent` text NOT NULL,
	`source` text NOT NULL,
	`raw_text` text,
	`params` text NOT NULL,
	`status` text NOT NULL,
	`preview` text,
	`result_version_id` text,
	`ai_job_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `par_user_idx` ON `plan_adjustment_requests` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `plan_change_history` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`domain` text NOT NULL,
	`from_version_id` text,
	`to_version_id` text NOT NULL,
	`summary` text NOT NULL,
	`changes` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `pch_user_idx` ON `plan_change_history` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `planned_meal_items` (
	`id` text PRIMARY KEY NOT NULL,
	`planned_meal_id` text NOT NULL,
	`food_id` text NOT NULL,
	`grams` real NOT NULL,
	FOREIGN KEY (`planned_meal_id`) REFERENCES `planned_meals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`food_id`) REFERENCES `foods`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `planned_meals` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`plan_version_id` text NOT NULL,
	`day_index` integer NOT NULL,
	`slot` text NOT NULL,
	`title` text NOT NULL,
	`time` text,
	`sort_order` integer NOT NULL,
	`kcal` real NOT NULL,
	`protein_g` real NOT NULL,
	`carbs_g` real NOT NULL,
	`fat_g` real NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`plan_version_id`) REFERENCES `nutrition_plan_versions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `pm_version_day_idx` ON `planned_meals` (`plan_version_id`,`day_index`);--> statement-breakpoint
CREATE TABLE `prescribed_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`workout_exercise_id` text NOT NULL,
	`set_index` integer NOT NULL,
	`rep_min` integer NOT NULL,
	`rep_max` integer NOT NULL,
	`target_rir` integer,
	FOREIGN KEY (`workout_exercise_id`) REFERENCES `workout_exercises`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `program_cycles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`cycle_number` integer NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`review_date` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `cycles_user_idx` ON `program_cycles` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `progress_checkins` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`workout_difficulty` integer,
	`recovery` integer,
	`consistency` integer,
	`pain` integer,
	`pain_notes` text,
	`appetite` integer,
	`energy` integer,
	`diet_adherence` integer,
	`schedule_changed` integer,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `checkins_user_date_idx` ON `progress_checkins` (`user_id`,`date`);--> statement-breakpoint
CREATE TABLE `progress_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`file_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`pose` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_endpoint_uq` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE TABLE `recipe_ingredients` (
	`id` text PRIMARY KEY NOT NULL,
	`recipe_id` text NOT NULL,
	`food_id` text NOT NULL,
	`grams` real NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`food_id`) REFERENCES `foods`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `recipes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`servings` real DEFAULT 1 NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`expires_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`remember` integer DEFAULT false NOT NULL,
	`user_agent` text,
	`ip` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `system_status` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `training_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`data` text DEFAULT '{}' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`personal` text DEFAULT '{}' NOT NULL,
	`lifestyle` text DEFAULT '{}' NOT NULL,
	`ai_preferences` text DEFAULT '{}' NOT NULL,
	`pending_plan_review` text,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'user' NOT NULL,
	`timezone` text DEFAULT 'Asia/Tehran' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_uq` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `workout_exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`slot_key` text NOT NULL,
	`sort_order` integer NOT NULL,
	`sets` integer NOT NULL,
	`rep_min` integer NOT NULL,
	`rep_max` integer NOT NULL,
	`rest_sec` integer NOT NULL,
	`target_rir` integer,
	FOREIGN KEY (`session_id`) REFERENCES `workout_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `we_session_idx` ON `workout_exercises` (`session_id`);--> statement-breakpoint
CREATE TABLE `workout_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`completed_workout_id` text NOT NULL,
	`difficulty` integer,
	`energy` integer,
	`pain` integer DEFAULT false NOT NULL,
	`pain_notes` text,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`completed_workout_id`) REFERENCES `completed_workouts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wf_workout_uq` ON `workout_feedback` (`completed_workout_id`);--> statement-breakpoint
CREATE TABLE `workout_plan_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`cycle_id` text NOT NULL,
	`version` integer NOT NULL,
	`status` text NOT NULL,
	`revision_reason` text NOT NULL,
	`previous_version_id` text,
	`plan` text NOT NULL,
	`profile_snapshot` text NOT NULL,
	`ai_job_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`activated_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`cycle_id`) REFERENCES `program_cycles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `wpv_user_status_idx` ON `workout_plan_versions` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `wpv_cycle_idx` ON `workout_plan_versions` (`cycle_id`);--> statement-breakpoint
CREATE TABLE `workout_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`plan_version_id` text NOT NULL,
	`session_key` text NOT NULL,
	`day_of_week` integer NOT NULL,
	`title` text NOT NULL,
	`focus` text NOT NULL,
	`estimated_minutes` integer NOT NULL,
	`sort_order` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`plan_version_id`) REFERENCES `workout_plan_versions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ws_version_idx` ON `workout_sessions` (`plan_version_id`);