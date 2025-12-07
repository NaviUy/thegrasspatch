import 'dotenv/config'
import { Client } from 'pg'
import fs from 'fs'
import path from 'path'

async function run() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
    })

    try {
        await client.connect()
        console.log('Connected to database.')

        const files = [
            // 'drizzle/0009_enable_realtime.sql', // Already applied
            'drizzle/0010_fix_rls_policies.sql',
            'drizzle/0011_add_authenticated_policy.sql',
        ]

        for (const file of files) {
            console.log(`Applying ${file}...`)
            const sql = fs.readFileSync(path.resolve(file), 'utf8')
            await client.query(sql)
            console.log(`Applied ${file}.`)
        }

        console.log('All fixes applied successfully.')
    } catch (err) {
        console.error('Error applying fixes:', err)
    } finally {
        await client.end()
    }
}

run()
