import 'dotenv/config'
import { signSupabaseToken } from './src/api/auth'

try {
    console.log('Checking SUPABASE_JWT_SECRET...')
    if (!process.env.SUPABASE_JWT_SECRET) {
        console.error('FAIL: SUPABASE_JWT_SECRET is not set in .env')
        process.exit(1)
    }
    console.log('OK: SUPABASE_JWT_SECRET is set.')

    console.log('Testing token generation...')
    const token = signSupabaseToken({ id: 'test-user', role: 'ADMIN' })
    console.log('OK: Token generated successfully.')
    console.log('Token:', token)
} catch (error) {
    console.error('FAIL: Error during verification:', error)
}
