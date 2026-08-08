ALTER TABLE "orders" ADD COLUMN "order_number" integer;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "next_order_number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint

WITH "ranked_orders" AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "session_id"
      ORDER BY "created_at", "id"
    )::integer AS "assigned_order_number"
  FROM "orders"
)
UPDATE "orders"
SET "order_number" = "ranked_orders"."assigned_order_number"
FROM "ranked_orders"
WHERE "orders"."id" = "ranked_orders"."id";--> statement-breakpoint

UPDATE "sessions"
SET "next_order_number" = COALESCE(
  (
    SELECT MAX("orders"."order_number") + 1
    FROM "orders"
    WHERE "orders"."session_id" = "sessions"."id"
  ),
  1
);--> statement-breakpoint

ALTER TABLE "orders" ALTER COLUMN "order_number" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "orders_session_order_number_unique" ON "orders" USING btree ("session_id", "order_number");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_order_number_positive" CHECK ("orders"."order_number" >= 1);--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_next_order_number_positive" CHECK ("sessions"."next_order_number" >= 1);
