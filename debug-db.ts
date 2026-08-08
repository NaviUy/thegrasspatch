import 'dotenv/config'
import { Client } from 'pg'

async function run() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
    })

    try {
        await client.connect()
        console.log('Connected to database.')

        // Check RLS on orders table
        const rlsRes = await client.query(`
      SELECT relname, relrowsecurity, relforcerowsecurity
      FROM pg_class
      WHERE oid = 'public.orders'::regclass;
    `)
        console.log('RLS Status:', rlsRes.rows[0])

        // Check Policies
        const policiesRes = await client.query(`
      SELECT polname, polpermissive, polroles, polcmd, pg_get_expr(polqual, polrelid) as qual
      FROM pg_policy
      WHERE polrelid = 'public.orders'::regclass;
    `)
        console.log('Policies:', policiesRes.rows)

        // Check Publication
        const pubRes = await client.query(`
      SELECT pubname, puballtables
      FROM pg_publication
      WHERE pubname = 'supabase_realtime';
    `)
        console.log('Publication:', pubRes.rows[0])

        // Check Tables in Publication
        const pubTablesRes = await client.query(`
      SELECT schemaname, tablename
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime';
    `)
        console.log('Tables in supabase_realtime:', pubTablesRes.rows)

    } catch (err) {
        console.error('Error:', err)
    } finally {
        await client.end()
    }
}

run()
