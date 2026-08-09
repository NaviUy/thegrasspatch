CREATE TABLE "menu_item_option_choices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"price_adjustment_cents" integer DEFAULT 0 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "menu_item_option_choices_price_adjustment_nonnegative" CHECK ("menu_item_option_choices"."price_adjustment_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "menu_item_option_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"menu_item_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"selection_type" varchar(20) NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	"min_selections" integer DEFAULT 0 NOT NULL,
	"max_selections" integer,
	"position" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "menu_item_option_groups_selection_limits_valid" CHECK ("menu_item_option_groups"."min_selections" >= 0 and ("menu_item_option_groups"."max_selections" is null or "menu_item_option_groups"."max_selections" >= "menu_item_option_groups"."min_selections"))
);
--> statement-breakpoint
CREATE TABLE "order_item_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_item_id" uuid NOT NULL,
	"option_group_id" uuid,
	"option_choice_id" uuid,
	"group_name" varchar(100) NOT NULL,
	"choice_name" varchar(100) NOT NULL,
	"price_adjustment_cents" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_option_choices" (
	"session_id" uuid NOT NULL,
	"option_choice_id" uuid NOT NULL,
	"inventory_limit" integer,
	"is_sold_out" boolean DEFAULT false NOT NULL,
	CONSTRAINT "session_option_choices_session_id_option_choice_id_pk" PRIMARY KEY("session_id","option_choice_id"),
	CONSTRAINT "session_option_choices_inventory_limit_nonnegative" CHECK ("session_option_choices"."inventory_limit" is null or "session_option_choices"."inventory_limit" >= 0)
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "special_instructions" varchar(200);--> statement-breakpoint
ALTER TABLE "menu_item_option_choices" ADD CONSTRAINT "menu_item_option_choices_group_id_menu_item_option_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."menu_item_option_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_item_option_groups" ADD CONSTRAINT "menu_item_option_groups_menu_item_id_menu_items_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_options" ADD CONSTRAINT "order_item_options_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_options" ADD CONSTRAINT "order_item_options_option_group_id_menu_item_option_groups_id_fk" FOREIGN KEY ("option_group_id") REFERENCES "public"."menu_item_option_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_options" ADD CONSTRAINT "order_item_options_option_choice_id_menu_item_option_choices_id_fk" FOREIGN KEY ("option_choice_id") REFERENCES "public"."menu_item_option_choices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_option_choices" ADD CONSTRAINT "session_option_choices_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_option_choices" ADD CONSTRAINT "session_option_choices_option_choice_id_menu_item_option_choices_id_fk" FOREIGN KEY ("option_choice_id") REFERENCES "public"."menu_item_option_choices"("id") ON DELETE cascade ON UPDATE no action;