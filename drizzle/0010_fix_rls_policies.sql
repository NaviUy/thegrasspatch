-- Enable RLS
alter table orders enable row level security;

-- Allow authenticated users (admins/workers) to view all orders
create policy "Authenticated users can view all orders"
on orders for select
to authenticated
using (true);

-- Allow anonymous users to view orders with matching tracking token
-- Note: This requires the client to set the tracking_token in the session variable or similar, 
-- but since we are using a custom JWT for anon users with 'tracking_token' claim, we can check that.
-- However, for simplicity and since the user mentioned: (auth.role() = 'service_role'::text),
-- we will stick to the plan of allowing anon users to view specific orders if they have the token.
-- Actually, the user's request mentioned they are using service_role for everything which is insecure.
-- We will implement a proper policy.

-- Policy for anon users (public order page)
-- They use a signed JWT which contains the tracking_token claim.
create policy "Anon users can view their own order"
on orders for select
to anon
using (
  tracking_token::text = (auth.jwt() ->> 'tracking_token')
);

-- Allow service_role to do everything (default, but good to be explicit if needed, though usually implicit bypass)
