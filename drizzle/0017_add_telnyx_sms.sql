ALTER TABLE "sms_events" ALTER COLUMN "status" SET DEFAULT 'SENDING';--> statement-breakpoint
ALTER TABLE "sms_events" ADD COLUMN IF NOT EXISTS "source_message_id" text;--> statement-breakpoint
ALTER TABLE "sms_events" ADD COLUMN IF NOT EXISTS "error_message" text;--> statement-breakpoint
ALTER TABLE "sms_events" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sms_events_order_type_unique" ON "sms_events" USING btree ("order_id","type");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sms_events_provider_message_id_unique" ON "sms_events" USING btree ("provider_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sms_events_source_message_id_unique" ON "sms_events" USING btree ("source_message_id");
