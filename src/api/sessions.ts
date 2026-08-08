import { desc, eq } from 'drizzle-orm'
import { ensureSessionInventoryRows } from './inventory'
import { db, schema } from '@/db/client'

export async function listSessions() {
  return db
    .select()
    .from(schema.sessions)
    .orderBy(desc(schema.sessions.createdAt))
}

export async function createSession(name: string) {
  return db.transaction(async (trx) => {
    const [session] = await trx
      .insert(schema.sessions)
      .values({
        name,
        isActive: false,
      })
      .returning()

    await ensureSessionInventoryRows(session.id, trx)
    return session
  })
}

export async function activateSession(id: string) {
  await db.update(schema.sessions).set({ isActive: false })

  const [session] = await db
    .update(schema.sessions)
    .set({ isActive: true })
    .where(eq(schema.sessions.id, id))
    .returning()

  if (!session) {
    throw new Error('Session not found.')
  }

  await ensureSessionInventoryRows(session.id)
  return session
}

export async function closeSession(id: string) {
  const [session] = await db
    .update(schema.sessions)
    .set({
      isActive: false,
      // closedAt: new Date(), // if you add this column later
    })
    .where(eq(schema.sessions.id, id))
    .returning()

  if (!session) {
    throw new Error('Session not found')
  }

  return session
}
