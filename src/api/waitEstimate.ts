import { and, desc, eq, inArray, isNotNull, or } from 'drizzle-orm'
import type { WaitEstimateMode } from '@/lib/waitEstimate'
import { db, schema } from '@/db/client'
import { calculateWaitEstimate } from '@/lib/waitEstimate'

type DatabaseClient = any

export async function getSessionWaitEstimate(
  sessionId: string,
  client: DatabaseClient = db,
) {
  const session = (
    await client
      .select({
        id: schema.sessions.id,
        name: schema.sessions.name,
        isActive: schema.sessions.isActive,
        mode: schema.sessions.waitEstimateMode,
        manualMinMinutes: schema.sessions.manualWaitMinMinutes,
        manualMaxMinutes: schema.sessions.manualWaitMaxMinutes,
        parallelCapacity: schema.sessions.parallelPreparationCapacity,
      })
      .from(schema.sessions)
      .where(eq(schema.sessions.id, sessionId))
      .limit(1)
  ).at(0)
  if (!session) throw new Error('Session not found.')

  const completedOrders = await client
    .select({
      makingAt: schema.orders.makingAt,
      fulfilledAt: schema.orders.fulfilledAt,
    })
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.sessionId, sessionId),
        eq(schema.orders.status, 'READY'),
        isNotNull(schema.orders.makingAt),
        isNotNull(schema.orders.fulfilledAt),
      ),
    )
    .orderBy(desc(schema.orders.fulfilledAt))
    .limit(10)
  const preparationTimes = completedOrders
    .map((order: any) =>
      Math.round(
        (order.fulfilledAt.getTime() - order.makingAt.getTime()) / 1000,
      ),
    )
    .filter((seconds: number) => seconds > 0 && seconds <= 4 * 60 * 60)
  const averagePreparationSeconds = preparationTimes.length
    ? Math.round(
        preparationTimes.reduce(
          (sum: number, seconds: number) => sum + seconds,
          0,
        ) / preparationTimes.length,
      )
    : null

  const outstandingOrders = await client
    .select({ id: schema.orders.id })
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.sessionId, sessionId),
        inArray(schema.orders.status, ['PENDING', 'MAKING']),
        or(
          eq(schema.orders.paymentStatus, 'NOT_REQUIRED'),
          eq(schema.orders.paymentStatus, 'PAID'),
          eq(schema.orders.paymentStatus, 'PARTIALLY_REFUNDED'),
          eq(schema.orders.paymentStatus, 'REFUNDED'),
        ),
      ),
    )
  const estimate = calculateWaitEstimate({
    mode: session.mode as WaitEstimateMode,
    manualMinMinutes: session.manualMinMinutes,
    manualMaxMinutes: session.manualMaxMinutes,
    parallelCapacity: session.parallelCapacity,
    averagePreparationSeconds,
    ordersAhead: outstandingOrders.length,
  })

  return {
    sessionId: session.id,
    sessionName: session.name,
    isActive: session.isActive,
    mode: session.mode as WaitEstimateMode,
    manualMinMinutes: session.manualMinMinutes,
    manualMaxMinutes: session.manualMaxMinutes,
    parallelCapacity: session.parallelCapacity,
    averagePreparationSeconds,
    sampleSize: preparationTimes.length,
    ordersAhead: outstandingOrders.length,
    ...estimate,
  }
}

export async function updateSessionWaitSettings(
  sessionId: string,
  input: {
    mode: WaitEstimateMode
    manualMinMinutes: number | null
    manualMaxMinutes: number | null
    parallelCapacity: number
  },
) {
  if (!['AUTO', 'MANUAL', 'HIDDEN'].includes(input.mode)) {
    throw new Error('Invalid wait estimate mode.')
  }
  if (
    !Number.isInteger(input.parallelCapacity) ||
    input.parallelCapacity < 1 ||
    input.parallelCapacity > 20
  ) {
    throw new Error('Parallel capacity must be between 1 and 20.')
  }
  if (input.mode === 'MANUAL') {
    if (
      !Number.isInteger(input.manualMinMinutes) ||
      !Number.isInteger(input.manualMaxMinutes) ||
      input.manualMinMinutes === null ||
      input.manualMaxMinutes === null ||
      input.manualMinMinutes < 1 ||
      input.manualMaxMinutes < input.manualMinMinutes ||
      input.manualMaxMinutes > 240
    ) {
      throw new Error(
        'Manual wait must be a valid range between 1 and 240 minutes.',
      )
    }
  }

  const updated = (
    await db
      .update(schema.sessions)
      .set({
        waitEstimateMode: input.mode,
        manualWaitMinMinutes:
          input.mode === 'MANUAL' ? input.manualMinMinutes : null,
        manualWaitMaxMinutes:
          input.mode === 'MANUAL' ? input.manualMaxMinutes : null,
        parallelPreparationCapacity: input.parallelCapacity,
      })
      .where(eq(schema.sessions.id, sessionId))
      .returning({ id: schema.sessions.id })
  ).at(0)
  if (!updated) throw new Error('Session not found.')
  return getSessionWaitEstimate(sessionId)
}
