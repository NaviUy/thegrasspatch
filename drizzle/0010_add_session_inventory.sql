ALTER TABLE "session_menu_items" ADD COLUMN "inventory_limit" integer;--> statement-breakpoint
ALTER TABLE "session_menu_items" ADD COLUMN "is_sold_out" boolean DEFAULT false NOT NULL;--> statement-breakpoint
INSERT INTO "session_menu_items" ("session_id", "menu_item_id")
SELECT "sessions"."id", "menu_items"."id"
FROM "sessions"
CROSS JOIN "menu_items"
ON CONFLICT ("session_id", "menu_item_id") DO NOTHING;--> statement-breakpoint
ALTER TABLE "session_menu_items" ADD CONSTRAINT "session_menu_items_inventory_limit_nonnegative" CHECK ("session_menu_items"."inventory_limit" is null or "session_menu_items"."inventory_limit" >= 0);
