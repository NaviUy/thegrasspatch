import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import jwt from 'jsonwebtoken'
import { getActiveSession, refreshCartItems } from './menuItem'
import { lockSessionInventoryRows } from './inventory'
import { db, schema } from '@/db/client'

export type CreatePublicOrderInput = {
  customerName: string
  customerPhone: string | null
  smsOptedInAt: Date | null
  smsConsentVersion: string | null
  items: Array<{ menuItemId: string; quantity: number; name?: string }>
}

const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET

export class OrderAvailabilityError extends Error {
  constructor(
    public availability: Awaited<ReturnType<typeof refreshCartItems>>,
  ) {
    super('Inventory changed while the order was being submitted.')
    this.name = 'OrderAvailabilityError'
  }
}

function signTrackingToken(token: string) {
  if (!SUPABASE_JWT_SECRET) {
    throw new Error('SUPABASE_JWT_SECRET is not configured.')
  }
  return jwt.sign(
    {
      role: 'anon',
      tracking_token: token,
    },
    SUPABASE_JWT_SECRET,
    { expiresIn: '12h', issuer: 'supabase', audience: 'authenticated' },
  )
}

export async function createPublicOrder(input: CreatePublicOrderInput) {
  const result = await db.transaction(async (trx) => {
    const session = (
      await trx
        .select({ id: schema.sessions.id })
        .from(schema.sessions)
        .where(eq(schema.sessions.isActive, true))
        .limit(1)
    ).at(0)

    if (!session) throw new Error('Active session not found.')

    await lockSessionInventoryRows(
      session.id,
      input.items.map((item) => item.menuItemId),
      trx,
    )

    const availability = await refreshCartItems(input.items, {
      sessionId: session.id,
      client: trx,
    })

    if (
      availability.active.length === 0 ||
      availability.removed.length > 0 ||
      availability.adjusted.length > 0
    ) {
      throw new OrderAvailabilityError(availability)
    }

    const totalPriceCents = availability.active.reduce(
      (sum, item) => sum + item.priceCents * item.quantity,
      0,
    )

    const numberState = (
      await trx
        .update(schema.sessions)
        .set({
          nextOrderNumber: sql`${schema.sessions.nextOrderNumber} + 1`,
        })
        .where(
          and(
            eq(schema.sessions.id, session.id),
            eq(schema.sessions.isActive, true),
          ),
        )
        .returning({ nextOrderNumber: schema.sessions.nextOrderNumber })
    ).at(0)

    if (!numberState) {
      throw new Error('The ordering session is no longer active.')
    }

    const orderNumber = Number(numberState.nextOrderNumber) - 1

    const order = (
      await trx
        .insert(schema.orders)
        .values({
          sessionId: session.id,
          orderNumber,
          customerName: input.customerName,
          customerPhone: input.customerPhone,
          smsOptedInAt: input.smsOptedInAt,
          smsConsentVersion: input.smsConsentVersion,
          totalPriceCents,
        })
        .returning()
    ).at(0)

    if (!order) throw new Error('Failed to create order.')

    await trx.insert(schema.orderItems).values(
      availability.active.map((item) => ({
        orderId: order.id,
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        unitPriceCents: item.priceCents,
      })),
    )

    return { order, availability }
  })

  const trackingJwt = signTrackingToken(result.order.trackingToken)

  return {
    order: result.order,
    trackingJwt,
    removed: result.availability.removed,
    adjusted: result.availability.adjusted,
  }
}

export async function getPublicOrder(orderId: string) {
  const [order] = await db
    .select({
      id: schema.orders.id,
      sessionId: schema.orders.sessionId,
      orderNumber: schema.orders.orderNumber,
      customerName: schema.orders.customerName,
      customerPhone: schema.orders.customerPhone,
      status: schema.orders.status,
      assignedWorkerId: schema.orders.assignedWorkerId,
      assignedWorkerName: schema.users.name,
      assignedAt: schema.orders.assignedAt,
      totalPriceCents: schema.orders.totalPriceCents,
      trackingToken: schema.orders.trackingToken,
      createdAt: schema.orders.createdAt,
      updatedAt: schema.orders.updatedAt,
    })
    .from(schema.orders)
    .leftJoin(schema.users, eq(schema.users.id, schema.orders.assignedWorkerId))
    .where(eq(schema.orders.id, orderId))
    .limit(1)

  if (!order) {
    throw new Error('Order not found.')
  }

  const items = await db
    .select({
      id: schema.orderItems.id,
      menuItemId: schema.orderItems.menuItemId,
      name: schema.menuItems.name,
      quantity: schema.orderItems.quantity,
      unitPriceCents: schema.orderItems.unitPriceCents,
    })
    .from(schema.orderItems)
    .leftJoin(
      schema.menuItems,
      eq(schema.menuItems.id, schema.orderItems.menuItemId),
    )
    .where(eq(schema.orderItems.orderId, orderId))

  return {
    ...order,
    items,
    trackingJwt: signTrackingToken(order.trackingToken),
  }
}

export async function listActiveSessionOrders() {
  const session = await getActiveSession()

  const orders = await db
    .select({
      id: schema.orders.id,
      sessionId: schema.orders.sessionId,
      orderNumber: schema.orders.orderNumber,
      customerName: schema.orders.customerName,
      customerPhone: schema.orders.customerPhone,
      status: schema.orders.status,
      assignedWorkerId: schema.orders.assignedWorkerId,
      assignedWorkerName: schema.users.name,
      assignedAt: schema.orders.assignedAt,
      totalPriceCents: schema.orders.totalPriceCents,
      createdAt: schema.orders.createdAt,
      updatedAt: schema.orders.updatedAt,
    })
    .from(schema.orders)
    .leftJoin(schema.users, eq(schema.users.id, schema.orders.assignedWorkerId))
    .where(eq(schema.orders.sessionId, session.id))
    .orderBy(schema.orders.createdAt)

  if (orders.length === 0) return []

  const orderIds = orders.map((o) => o.id)
  const items = await db
    .select({
      id: schema.orderItems.id,
      orderId: schema.orderItems.orderId,
      menuItemId: schema.orderItems.menuItemId,
      name: schema.menuItems.name,
      quantity: schema.orderItems.quantity,
      unitPriceCents: schema.orderItems.unitPriceCents,
    })
    .from(schema.orderItems)
    .leftJoin(
      schema.menuItems,
      eq(schema.menuItems.id, schema.orderItems.menuItemId),
    )
    .where(inArray(schema.orderItems.orderId, orderIds))

  const itemsByOrder = items.reduce<Record<string, typeof items>>(
    (acc, item) => {
      acc[item.orderId] = acc[item.orderId] || []
      acc[item.orderId].push(item)
      return acc
    },
    {},
  )

  return orders.map((order) => ({
    ...order,
    items: itemsByOrder[order.id] ?? [],
  }))
}

export async function assignOrderToUser(orderId: string, userId: string) {
  const session = await getActiveSession()

  const [order] = await db
    .select({
      id: schema.orders.id,
      sessionId: schema.orders.sessionId,
      assignedWorkerId: schema.orders.assignedWorkerId,
    })
    .from(schema.orders)
    .where(eq(schema.orders.id, orderId))
    .limit(1)

  if (!order) {
    throw new Error('Order not found.')
  }

  if (order.sessionId !== session.id) {
    throw new Error('Cannot assign order from a closed session.')
  }

  if (order.assignedWorkerId && order.assignedWorkerId !== userId) {
    throw new Error('Order already assigned to another user.')
  }

  if (order.assignedWorkerId === userId) {
    return getPublicOrder(orderId)
  }

  const [updated] = await db
    .update(schema.orders)
    .set({
      assignedWorkerId: userId,
      assignedAt: new Date(),
    })
    .where(
      and(
        eq(schema.orders.id, orderId),
        isNull(schema.orders.assignedWorkerId),
      ),
    )
    .returning()

  if (!updated) {
    throw new Error('Order already assigned to another user.')
  }

  return getPublicOrder(orderId)
}

export async function updateOrderStatus(input: {
  orderId: string
  status: 'PENDING' | 'MAKING' | 'READY'
  userId: string
  userRole?: string
}) {
  const session = await getActiveSession()

  const [order] = await db
    .select({
      id: schema.orders.id,
      sessionId: schema.orders.sessionId,
      assignedWorkerId: schema.orders.assignedWorkerId,
    })
    .from(schema.orders)
    .where(eq(schema.orders.id, input.orderId))
    .limit(1)

  if (!order) {
    throw new Error('Order not found.')
  }

  if (order.sessionId !== session.id) {
    throw new Error('Cannot update order from a closed session.')
  }

  const canEdit =
    order.assignedWorkerId === input.userId || input.userRole === 'ADMIN'
  if (!canEdit) {
    throw new Error('You are not assigned to this order.')
  }

  const allowedStatuses = ['PENDING', 'MAKING', 'READY']
  if (!allowedStatuses.includes(input.status)) {
    throw new Error('Invalid status.')
  }

  const [updated] = await db
    .update(schema.orders)
    .set({
      status: input.status,
      updatedAt: new Date(),
    })
    .where(eq(schema.orders.id, input.orderId))
    .returning()

  if (!updated) {
    throw new Error('Failed to update status.')
  }

  return getPublicOrder(input.orderId)
}

export async function unassignOrder(orderId: string, userId: string) {
  const session = await getActiveSession()

  const [order] = await db
    .select({
      id: schema.orders.id,
      sessionId: schema.orders.sessionId,
      assignedWorkerId: schema.orders.assignedWorkerId,
    })
    .from(schema.orders)
    .where(eq(schema.orders.id, orderId))
    .limit(1)

  if (!order) {
    throw new Error('Order not found.')
  }

  if (order.sessionId !== session.id) {
    throw new Error('Cannot unassign order from a closed session.')
  }

  if (order.assignedWorkerId && order.assignedWorkerId !== userId) {
    throw new Error('Only the assigned worker can unassign this order.')
  }

  const [updated] = await db
    .update(schema.orders)
    .set({
      assignedWorkerId: null,
      assignedAt: null,
    })
    .where(eq(schema.orders.id, orderId))
    .returning()

  if (!updated) {
    throw new Error('Failed to unassign order.')
  }

  return getPublicOrder(orderId)
}
