// src/db/client.ts
import 'dotenv/config'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // needed for Supabase in many local setups
  },
  max: 1, // max concurrent connections (keep low for Lambda)
  idleTimeoutMillis: 30000, // close idle clients after 30s
  connectionTimeoutMillis: 30000, // wait up to 30s for connection (helps with cold starts)
  keepAlive: true,
})

pool.on('error', (err) => {
  console.error('Unexpected PG pool error: ', err)
})

export const db = drizzle(pool, { schema })
export { schema }
