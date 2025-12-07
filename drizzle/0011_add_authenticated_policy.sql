-- Drop policy if it exists to avoid conflicts
drop policy if exists "Authenticated users can view all orders" on orders;

-- Create policy for authenticated users (admins/workers)
create policy "Authenticated users can view all orders"
on orders for select
to authenticated
using (true);
