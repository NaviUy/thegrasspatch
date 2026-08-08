import * as bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { db, schema } from '../db/client'
import { eq, and, isNull } from 'drizzle-orm'

const JWT_SECRET = process.env.JWT_SECRET as string
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is not set')
}

const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET as string
if (!SUPABASE_JWT_SECRET) {
  throw new Error('SUPABASE_JWT_SECRET is not set')
}

export function signSupabaseToken(user: { id: string; role: string }) {
  // Supabase expects 'role' to be 'authenticated' for logged-in users
  // We store the actual app role (ADMIN/WORKER) in 'app_role' claim
  return jwt.sign(
    {
      sub: user.id,
      role: 'authenticated',
      app_role: user.role,
    },
    SUPABASE_JWT_SECRET,
    {
      expiresIn: '7d',
      issuer: 'supabase',
      audience: 'authenticated',
    },
  )
}

//Shape of JWT payload
export type AuthTokenPayload = {
  sub: string
  email: string
  role: string
}

//Helper to strip passwordHash before sending user to client.
function sanitizeUser(user: typeof schema.users.$inferSelect) {
  const { passwordHash, ...rest } = user
  return rest
}

/**
 * Signup using an invite code.
 */

export async function signupWithInvite(params: {
  name: string
  email: string
  password: string
  inviteCode: string
}) {
  const { name, email, password, inviteCode } = params
  const [invite] = await db
    .select()
    .from(schema.inviteTokens)
    .where(
      and(
        eq(schema.inviteTokens.code, inviteCode),
        isNull(schema.inviteTokens.usedAt),
      ),
    )

  if (!invite) {
    throw new Error('Invalid or already used invite code')
  }

  if (invite.expiresAt && invite.expiresAt < new Date()) {
    throw new Error('Invite code has expired')
  }

  const existingUsers = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email.toLowerCase()))

  if (existingUsers.length > 0) {
    throw new Error('User with this email already exists')
  }

  const passwordHash = await bcrypt.hash(password, 10)

  const [user] = await db
    .insert(schema.users)
    .values({
      name: name.trim(),
      email: email.toLowerCase(),
      passwordHash,
      role: invite.role, // e.g. 'WORKER' or 'ADMIN'
    })
    .returning()

  await db
    .update(schema.inviteTokens)
    .set({
      usedAt: new Date(),
      usedByUserId: user.id,
    })
    .where(eq(schema.inviteTokens.id, invite.id))

  const tokenPayload: AuthTokenPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
  }

  const token = jwt.sign(tokenPayload, JWT_SECRET, {
    expiresIn: '7d',
  })

  return {
    token,
    supabaseJwt: signSupabaseToken(user),
    user: sanitizeUser(user),
  }
}

/**
 * Login with email + password.
 */

export async function loginWithPassword(params: {
  email: string
  password: string
}) {
  const { email, password } = params

  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email.toLowerCase()))

  if (!user) {
    throw new Error('Invalid email or password')
  }

  const ok = await bcrypt.compare(password, user.passwordHash)
  if (!ok) {
    throw new Error('Invalid email or password')
  }

  const payload: AuthTokenPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
  }

  const token = jwt.sign(payload, JWT_SECRET, {
    expiresIn: '7d',
  })

  return {
    token,
    supabaseJwt: signSupabaseToken(user),
    user: sanitizeUser(user),
  }
}

export function verifyToken(token: string): AuthTokenPayload {
  const decoded = jwt.verify(token, JWT_SECRET) as AuthTokenPayload
  return decoded
}

export async function getUserFromToken(token: string) {
  const payload = verifyToken(token)

  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, payload.sub))

  if (!user) {
    throw new Error('User not found for token.')
  }

  return sanitizeUser(user)
}
