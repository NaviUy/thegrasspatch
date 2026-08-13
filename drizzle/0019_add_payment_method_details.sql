ALTER TABLE "order_payments" ADD COLUMN "payment_method_brand" varchar(32);--> statement-breakpoint
ALTER TABLE "order_payments" ADD COLUMN "payment_method_last4" varchar(4);--> statement-breakpoint
ALTER TABLE "order_payments" ADD COLUMN "payment_method_wallet" varchar(32);
