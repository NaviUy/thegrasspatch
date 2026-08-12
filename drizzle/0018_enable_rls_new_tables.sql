-- These tables are exposed through Supabase's public PostgREST schema.
-- Enabling RLS without public policies makes them deny-by-default for the
-- anon and authenticated API roles. The backend's database-owner connection
-- continues to access them normally. This operation preserves all rows.

alter table public.menu_item_option_groups enable row level security;
alter table public.menu_item_option_choices enable row level security;
alter table public.order_item_options enable row level security;
alter table public.session_option_choices enable row level security;
alter table public.order_events enable row level security;
alter table public.order_payments enable row level security;
alter table public.payment_refunds enable row level security;
