ALTER TABLE "orders" ADD COLUMN "making_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "estimated_wait_min_minutes" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "estimated_wait_max_minutes" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "wait_estimate_source" varchar(20);--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "wait_estimate_mode" varchar(20) DEFAULT 'AUTO' NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "manual_wait_min_minutes" integer;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "manual_wait_max_minutes" integer;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "parallel_preparation_capacity" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_estimated_wait_range_valid" CHECK (("orders"."estimated_wait_min_minutes" is null and "orders"."estimated_wait_max_minutes" is null) or ("orders"."estimated_wait_min_minutes" >= 1 and "orders"."estimated_wait_max_minutes" >= "orders"."estimated_wait_min_minutes"));--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_wait_estimate_mode_valid" CHECK ("sessions"."wait_estimate_mode" in ('AUTO', 'MANUAL', 'HIDDEN'));--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_manual_wait_range_valid" CHECK (("sessions"."manual_wait_min_minutes" is null and "sessions"."manual_wait_max_minutes" is null) or ("sessions"."manual_wait_min_minutes" >= 1 and "sessions"."manual_wait_max_minutes" >= "sessions"."manual_wait_min_minutes"));--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_parallel_preparation_capacity_positive" CHECK ("sessions"."parallel_preparation_capacity" >= 1);