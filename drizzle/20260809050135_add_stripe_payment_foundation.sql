CREATE TABLE "order_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"kind" varchar(24) NOT NULL,
	"status" varchar(24) DEFAULT 'PENDING' NOT NULL,
	"currency" varchar(3) DEFAULT 'usd' NOT NULL,
	"amount_cents" integer NOT NULL,
	"food_amount_cents" integer DEFAULT 0 NOT NULL,
	"tip_amount_cents" integer DEFAULT 0 NOT NULL,
	"refunded_amount_cents" integer DEFAULT 0 NOT NULL,
	"provider_checkout_session_id" varchar(255),
	"provider_payment_intent_id" varchar(255),
	"provider_charge_id" varchar(255),
	"expires_at" timestamp with time zone,
	"succeeded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_payments_kind_valid" CHECK ("order_payments"."kind" in ('ORDER_CHECKOUT', 'POST_ORDER_TIP')),
	CONSTRAINT "order_payments_status_valid" CHECK ("order_payments"."status" in ('PENDING', 'SUCCEEDED', 'FAILED', 'EXPIRED', 'PARTIALLY_REFUNDED', 'REFUNDED')),
	CONSTRAINT "order_payments_amounts_valid" CHECK ("order_payments"."amount_cents" >= 0 and "order_payments"."food_amount_cents" >= 0 and "order_payments"."tip_amount_cents" >= 0 and "order_payments"."refunded_amount_cents" >= 0 and "order_payments"."amount_cents" = "order_payments"."food_amount_cents" + "order_payments"."tip_amount_cents" and "order_payments"."refunded_amount_cents" <= "order_payments"."amount_cents")
);
--> statement-breakpoint
CREATE TABLE "payment_refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_payment_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"amount_cents" integer NOT NULL,
	"food_amount_cents" integer DEFAULT 0 NOT NULL,
	"tip_amount_cents" integer DEFAULT 0 NOT NULL,
	"reason" varchar(250),
	"idempotency_key" varchar(255) NOT NULL,
	"provider_refund_id" varchar(255),
	"requested_by_user_id" uuid,
	"last_error" text,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_refunds_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "payment_refunds_provider_refund_id_unique" UNIQUE("provider_refund_id"),
	CONSTRAINT "payment_refunds_status_valid" CHECK ("payment_refunds"."status" in ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELED')),
	CONSTRAINT "payment_refunds_amounts_valid" CHECK ("payment_refunds"."amount_cents" > 0 and "payment_refunds"."food_amount_cents" >= 0 and "payment_refunds"."tip_amount_cents" >= 0 and "payment_refunds"."amount_cents" = "payment_refunds"."food_amount_cents" + "payment_refunds"."tip_amount_cents")
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_status" varchar(24) DEFAULT 'NOT_REQUIRED' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "food_amount_paid_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "checkout_tip_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "post_order_tip_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "food_amount_refunded_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tip_amount_refunded_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_order_payment_id_order_payments_id_fk" FOREIGN KEY ("order_payment_id") REFERENCES "public"."order_payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_payments_order_id_idx" ON "order_payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_payments_status_idx" ON "order_payments" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "order_payments_provider_checkout_session_id_unique" ON "order_payments" USING btree ("provider_checkout_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_payments_provider_payment_intent_id_unique" ON "order_payments" USING btree ("provider_payment_intent_id");--> statement-breakpoint
CREATE INDEX "payment_refunds_order_payment_id_idx" ON "payment_refunds" USING btree ("order_payment_id");--> statement-breakpoint
CREATE INDEX "payment_refunds_status_idx" ON "payment_refunds" USING btree ("status");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_status_valid" CHECK ("orders"."payment_status" in ('NOT_REQUIRED', 'PENDING', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED', 'FAILED', 'EXPIRED'));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_amounts_nonnegative" CHECK ("orders"."food_amount_paid_cents" >= 0 and "orders"."checkout_tip_cents" >= 0 and "orders"."post_order_tip_cents" >= 0 and "orders"."food_amount_refunded_cents" >= 0 and "orders"."tip_amount_refunded_cents" >= 0);
