// src/api/__tests__/auth.test.ts
import { db, schema } from '../../db/client'
import { signupWithInvite, loginWithPassword } from '../auth'
import { eq } from 'drizzle-orm'

afterAll(async () => {
  await db.delete(schema.inviteTokens).execute()
  await db.delete(schema.users).execute()
})

describe('auth: signupWithInvite & loginWithPassword', () => {
  const testInviteCode = 'TEST-INVITE-CODE'
  const testEmail = 'test-user@example.com'
  const testPassword = 'super-secret-password'

  beforeAll(async () => {
    // Clean out relevant tables (order matters due to FKs)
    await db
      .delete(schema.smsEvents)
      .execute?.()
      .catch(() => {})
    await db
      .delete(schema.orderItems)
      .execute?.()
      .catch(() => {})
    await db
      .delete(schema.orders)
      .execute?.()
      .catch(() => {})
    await db.delete(schema.inviteTokens).execute()
    await db.delete(schema.users).execute()

    // Insert a fresh invite token
    await db.insert(schema.inviteTokens).values({
      code: testInviteCode,
      role: 'WORKER',
    })
  })

  afterAll(async () => {
    // Optional: clean up again
    await db.delete(schema.inviteTokens).execute()
    await db.delete(schema.users).execute()
  })

  it('allows signup with a valid invite code', async () => {
    const result = await signupWithInvite({
      email: testEmail,
      password: testPassword,
      inviteCode: testInviteCode,
    })

    expect(result.token).toBeDefined()
    expect(result.user.email).toBe(testEmail.toLowerCase())
    expect(result.user.role).toBe('WORKER')

    // invite should now be marked as used
    const [invite] = await db
      .select()
      .from(schema.inviteTokens)
      .where(eq(schema.inviteTokens.code, testInviteCode))

    expect(invite).toBeDefined()
    expect(invite.usedAt).not.toBeNull()
    expect(invite.usedByUserId).toBe(result.user.id)
  })

  it('allows login with the same email/password', async () => {
    const result = await loginWithPassword({
      email: testEmail,
      password: testPassword,
    })

    expect(result.token).toBeDefined()
    expect(result.user.email).toBe(testEmail.toLowerCase())
    expect(result.user.role).toBe('WORKER')
  })

  it('rejects signup with an already-used invite code', async () => {
    await expect(
      signupWithInvite({
        email: 'another@example.com',
        password: 'whatever',
        inviteCode: testInviteCode,
      }),
    ).rejects.toThrow(/Invalid or already used invite code/i)
  })

  it('rejects login with wrong password', async () => {
    await expect(
      loginWithPassword({
        email: testEmail,
        password: 'wrong-password',
      }),
    ).rejects.toThrow(/Invalid email or password/i)
  })

  it('rejects login for non-existent user', async () => {
    await expect(
      loginWithPassword({
        email: 'nope@example.com',
        password: 'anything',
      }),
    ).rejects.toThrow(/Invalid email or password/i)
  })
})
