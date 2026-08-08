import { db, schema } from '@/db/client'
import { randomBytes } from 'crypto'

export type InviteRole = 'ADMIN' | 'WORKER'

function generateInviteCode() {
  const raw = randomBytes(6).toString('hex').toUpperCase()
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`
}

export async function createInvite(role: InviteRole) {
  if (role != 'ADMIN' && role !== 'WORKER') {
    throw new Error('Invalid role for invite.')
  }

  const code = generateInviteCode()

  const [invite] = await db
    .insert(schema.inviteTokens)
    .values({ code, role })
    .returning()

  return invite
}
