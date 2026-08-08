ALTER TABLE "orders" ADD COLUMN "sms_opted_in_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "sms_consent_version" varchar(50);