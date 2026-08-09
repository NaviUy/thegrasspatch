ALTER TABLE "order_items" ADD COLUMN "item_name" varchar(255);--> statement-breakpoint
UPDATE "order_items"
SET "item_name" = "menu_items"."name"
FROM "menu_items"
WHERE "order_items"."menu_item_id" = "menu_items"."id";--> statement-breakpoint
UPDATE "order_items" SET "item_name" = 'Menu item' WHERE "item_name" IS NULL;--> statement-breakpoint
ALTER TABLE "order_items" ALTER COLUMN "item_name" SET NOT NULL;--> statement-breakpoint
UPDATE "orders"
SET "fulfilled_at" = "updated_at"
WHERE "status" = 'READY' AND "fulfilled_at" IS NULL;
