import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import jwt from 'jsonwebtoken'
import { getActiveSession, refreshCartItems } from './menuItem'
import { lockSessionInventoryRows } from './inventory'
import { lockSessionOptionInventoryRows } from './options'
import { getSessionWaitEstimate } from './waitEstimate'
import { db, schema } from '@/db/client'

export type CreatePublicOrderInput = {
  customerName: string
  customerPhone: string | null
  smsOptedInAt: Date | null
  smsConsentVersion: string | null
  items: Array<{
    cartLineId: string
    menuItemId: string
    quantity: number
    name?: string
    selectedOptionChoiceIds?: Array<string>
    specialInstructions?: string
  }>
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

export class OrderConflictError extends Error {
  constructor(
    message = 'This order was changed by someone else. Reload it and try again.',
  ) {
    super(message)
    this.name = 'OrderConflictError'
  }
}

export type CorrectOrderInput = {
  orderId: string
  version: number
  userId: string
  userRole: string
  reason: string
  items: Array<{
    lineId?: string
    menuItemId: string
    quantity: number
    selectedOptionChoiceIds?: Array<string>
    specialInstructions?: string
  }>
}

function isManager(role?: string) {
  return role === 'OWNER' || role === 'ADMIN'
}

async function loadOrderSnapshot(orderId: string, client: any = db) {
  const order = (
    await client
      .select({
        id: schema.orders.id,
        sessionId: schema.orders.sessionId,
        orderNumber: schema.orders.orderNumber,
        customerName: schema.orders.customerName,
        status: schema.orders.status,
        version: schema.orders.version,
        assignedWorkerId: schema.orders.assignedWorkerId,
        totalPriceCents: schema.orders.totalPriceCents,
        createdAt: schema.orders.createdAt,
        updatedAt: schema.orders.updatedAt,
        cancelledAt: schema.orders.cancelledAt,
      })
      .from(schema.orders)
      .where(eq(schema.orders.id, orderId))
      .limit(1)
  ).at(0)
  if (!order) throw new Error('Order not found.')

  const items = await client
    .select({
      id: schema.orderItems.id,
      menuItemId: schema.orderItems.menuItemId,
      name: schema.orderItems.itemName,
      quantity: schema.orderItems.quantity,
      unitPriceCents: schema.orderItems.unitPriceCents,
      specialInstructions: schema.orderItems.specialInstructions,
    })
    .from(schema.orderItems)
    .where(eq(schema.orderItems.orderId, orderId))
  const options = items.length
    ? await client
        .select({
          orderItemId: schema.orderItemOptions.orderItemId,
          optionGroupId: schema.orderItemOptions.optionGroupId,
          optionChoiceId: schema.orderItemOptions.optionChoiceId,
          groupName: schema.orderItemOptions.groupName,
          choiceName: schema.orderItemOptions.choiceName,
          priceAdjustmentCents: schema.orderItemOptions.priceAdjustmentCents,
        })
        .from(schema.orderItemOptions)
        .where(
          inArray(
            schema.orderItemOptions.orderItemId,
            items.map((item: any) => item.id),
          ),
        )
    : []

  return {
    ...order,
    items: items.map((item: any) => ({
      ...item,
      selectedOptions: options.filter(
        (option: any) => option.orderItemId === item.id,
      ),
    })),
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

    const waitEstimate = await getSessionWaitEstimate(session.id, trx)

    await lockSessionInventoryRows(
      session.id,
      input.items.map((item) => item.menuItemId),
      trx,
    )
    await lockSessionOptionInventoryRows(
      session.id,
      input.items.flatMap((item) => item.selectedOptionChoiceIds ?? []),
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
          estimatedWaitMinMinutes: waitEstimate.minMinutes,
          estimatedWaitMaxMinutes: waitEstimate.maxMinutes,
          waitEstimateSource: waitEstimate.source,
        })
        .returning()
    ).at(0)

    if (!order) throw new Error('Failed to create order.')

    for (const item of availability.active) {
      const orderItem = (
        await trx
          .insert(schema.orderItems)
          .values({
            orderId: order.id,
            menuItemId: item.menuItemId,
            itemName: item.name,
            quantity: item.quantity,
            unitPriceCents: item.priceCents,
            specialInstructions: item.specialInstructions || null,
          })
          .returning({ id: schema.orderItems.id })
      ).at(0)
      if (!orderItem) throw new Error('Failed to create order item.')
      if (item.selectedOptions.length) {
        await trx.insert(schema.orderItemOptions).values(
          item.selectedOptions.map((selected) => ({
            orderItemId: orderItem.id,
            optionGroupId: selected.optionGroupId,
            optionChoiceId: selected.optionChoiceId,
            groupName: selected.groupName,
            choiceName: selected.choiceName,
            priceAdjustmentCents: selected.priceAdjustmentCents,
          })),
        )
      }
    }

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
  const order = (
    await db
      .select({
        id: schema.orders.id,
        sessionId: schema.orders.sessionId,
        orderNumber: schema.orders.orderNumber,
        customerName: schema.orders.customerName,
        customerPhone: schema.orders.customerPhone,
        status: schema.orders.status,
        version: schema.orders.version,
        assignedWorkerId: schema.orders.assignedWorkerId,
        assignedWorkerName: schema.users.name,
        assignedAt: schema.orders.assignedAt,
        totalPriceCents: schema.orders.totalPriceCents,
        trackingToken: schema.orders.trackingToken,
        createdAt: schema.orders.createdAt,
        updatedAt: schema.orders.updatedAt,
        cancelledAt: schema.orders.cancelledAt,
        estimatedWaitMinMinutes: schema.orders.estimatedWaitMinMinutes,
        estimatedWaitMaxMinutes: schema.orders.estimatedWaitMaxMinutes,
        waitEstimateSource: schema.orders.waitEstimateSource,
      })
      .from(schema.orders)
      .leftJoin(
        schema.users,
        eq(schema.users.id, schema.orders.assignedWorkerId),
      )
      .where(eq(schema.orders.id, orderId))
      .limit(1)
  ).at(0)

  if (!order) {
    throw new Error('Order not found.')
  }

  const items = await db
    .select({
      id: schema.orderItems.id,
      menuItemId: schema.orderItems.menuItemId,
      name: schema.orderItems.itemName,
      quantity: schema.orderItems.quantity,
      unitPriceCents: schema.orderItems.unitPriceCents,
      specialInstructions: schema.orderItems.specialInstructions,
    })
    .from(schema.orderItems)
    .leftJoin(
      schema.menuItems,
      eq(schema.menuItems.id, schema.orderItems.menuItemId),
    )
    .where(eq(schema.orderItems.orderId, orderId))

  const selectedOptions = items.length
    ? await db
        .select({
          orderItemId: schema.orderItemOptions.orderItemId,
          optionGroupId: schema.orderItemOptions.optionGroupId,
          optionChoiceId: schema.orderItemOptions.optionChoiceId,
          groupName: schema.orderItemOptions.groupName,
          choiceName: schema.orderItemOptions.choiceName,
          priceAdjustmentCents: schema.orderItemOptions.priceAdjustmentCents,
        })
        .from(schema.orderItemOptions)
        .where(
          inArray(
            schema.orderItemOptions.orderItemId,
            items.map((item) => item.id),
          ),
        )
    : []

  return {
    ...order,
    items: items.map((item) => ({
      ...item,
      selectedOptions: selectedOptions.filter(
        (selected) => selected.orderItemId === item.id,
      ),
    })),
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
      version: schema.orders.version,
      assignedWorkerId: schema.orders.assignedWorkerId,
      assignedWorkerName: schema.users.name,
      assignedAt: schema.orders.assignedAt,
      totalPriceCents: schema.orders.totalPriceCents,
      createdAt: schema.orders.createdAt,
      updatedAt: schema.orders.updatedAt,
      cancelledAt: schema.orders.cancelledAt,
      cancellationReason: schema.orders.cancellationReason,
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
      name: schema.orderItems.itemName,
      quantity: schema.orderItems.quantity,
      unitPriceCents: schema.orderItems.unitPriceCents,
      specialInstructions: schema.orderItems.specialInstructions,
    })
    .from(schema.orderItems)
    .leftJoin(
      schema.menuItems,
      eq(schema.menuItems.id, schema.orderItems.menuItemId),
    )
    .where(inArray(schema.orderItems.orderId, orderIds))

  const optionRows = items.length
    ? await db
        .select({
          orderItemId: schema.orderItemOptions.orderItemId,
          optionGroupId: schema.orderItemOptions.optionGroupId,
          optionChoiceId: schema.orderItemOptions.optionChoiceId,
          groupName: schema.orderItemOptions.groupName,
          choiceName: schema.orderItemOptions.choiceName,
          priceAdjustmentCents: schema.orderItemOptions.priceAdjustmentCents,
        })
        .from(schema.orderItemOptions)
        .where(
          inArray(
            schema.orderItemOptions.orderItemId,
            items.map((item) => item.id),
          ),
        )
    : []

  const enrichedItems = items.map((item) => ({
    ...item,
    selectedOptions: optionRows.filter(
      (option) => option.orderItemId === item.id,
    ),
  }))

  const itemsByOrder = enrichedItems.reduce<
    Record<string, typeof enrichedItems>
  >((acc, item) => {
    const orderItems = acc[item.orderId] ?? []
    orderItems.push(item)
    acc[item.orderId] = orderItems
    return acc
  }, {})

  return orders.map((order) => ({
    ...order,
    items: itemsByOrder[order.id] ?? [],
  }))
}

export async function correctOrder(input: CorrectOrderInput) {
  const reason = input.reason.trim().slice(0, 250)
  if (reason.length < 2) throw new Error('A correction reason is required.')
  if (!Number.isInteger(input.version) || input.version < 1) {
    throw new Error('A valid order version is required.')
  }
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new Error('An order must contain at least one item.')
  }
  if (input.items.length > 100)
    throw new Error('This order has too many items.')

  const normalized = input.items.map((item, index) => {
    if (typeof item.menuItemId !== 'string') {
      throw new Error('Every order item must reference a menu item.')
    }
    const quantity = Math.floor(Number(item.quantity))
    if (!Number.isFinite(quantity) || quantity < 1 || quantity > 99) {
      throw new Error('Item quantities must be between 1 and 99.')
    }
    return {
      cartLineId: item.lineId || `new-${index}`,
      menuItemId: item.menuItemId,
      quantity,
      selectedOptionChoiceIds: Array.isArray(item.selectedOptionChoiceIds)
        ? [
            ...new Set(
              item.selectedOptionChoiceIds.filter(
                (id) => typeof id === 'string',
              ),
            ),
          ]
        : [],
      specialInstructions: (item.specialInstructions ?? '')
        .trim()
        .slice(0, 200),
    }
  })

  await db.transaction(async (trx) => {
    await trx.execute(
      sql`select ${schema.orders.id} from ${schema.orders} where ${schema.orders.id} = ${input.orderId} for update`,
    )
    const before = await loadOrderSnapshot(input.orderId, trx)
    const activeSession = (
      await trx
        .select({ id: schema.sessions.id })
        .from(schema.sessions)
        .where(eq(schema.sessions.isActive, true))
        .limit(1)
    ).at(0)
    if (!activeSession || before.sessionId !== activeSession.id) {
      throw new Error('Cannot edit an order from a closed session.')
    }
    const canEdit =
      isManager(input.userRole) || before.assignedWorkerId === input.userId
    if (!canEdit) throw new Error('You are not assigned to this order.')
    if (before.status !== 'PENDING' && before.status !== 'MAKING') {
      throw new Error('Only pending or making orders can be edited.')
    }
    if (before.version !== input.version) throw new OrderConflictError()

    const existingLineIds = new Set(
      before.items.map((item: any) => item.id as string),
    )
    const itemsForValidation = [...normalized].sort(
      (a, b) =>
        Number(existingLineIds.has(b.cartLineId)) -
        Number(existingLineIds.has(a.cartLineId)),
    )

    await lockSessionInventoryRows(
      before.sessionId,
      itemsForValidation.map((item) => item.menuItemId),
      trx,
    )
    await lockSessionOptionInventoryRows(
      before.sessionId,
      itemsForValidation.flatMap((item) => item.selectedOptionChoiceIds),
      trx,
    )
    const availability = await refreshCartItems(itemsForValidation, {
      sessionId: before.sessionId,
      client: trx,
      excludeOrderId: before.id,
      preservedLines: before.items.map((item: any) => ({
        lineId: item.id,
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        selectedOptionChoiceIds: item.selectedOptions
          .map((option: any) => option.optionChoiceId)
          .filter(Boolean),
      })),
    })
    if (
      availability.active.length !== normalized.length ||
      availability.removed.length > 0 ||
      availability.adjusted.length > 0
    ) {
      throw new OrderAvailabilityError(availability)
    }

    const oldLines = new Map(before.items.map((item: any) => [item.id, item]))
    const linesToSave = availability.active.map((item) => {
      const old: any = oldLines.get(item.cartLineId)
      const oldChoiceIds = old
        ? old.selectedOptions
            .map((option: any) => option.optionChoiceId)
            .filter(Boolean)
            .sort()
        : []
      const newChoiceIds = item.selectedOptions
        .map((option) => option.optionChoiceId)
        .sort()
      const unchanged =
        old &&
        old.menuItemId === item.menuItemId &&
        old.quantity === item.quantity &&
        (old.specialInstructions ?? '') === item.specialInstructions &&
        JSON.stringify(oldChoiceIds) === JSON.stringify(newChoiceIds)
      return unchanged
        ? {
            ...item,
            name: old.name,
            priceCents: old.unitPriceCents,
            selectedOptions: old.selectedOptions,
          }
        : item
    })

    await trx
      .delete(schema.orderItems)
      .where(eq(schema.orderItems.orderId, before.id))
    for (const item of linesToSave) {
      const saved = (
        await trx
          .insert(schema.orderItems)
          .values({
            orderId: before.id,
            menuItemId: item.menuItemId,
            itemName: item.name,
            quantity: item.quantity,
            unitPriceCents: item.priceCents,
            specialInstructions: item.specialInstructions || null,
          })
          .returning({ id: schema.orderItems.id })
      ).at(0)
      if (!saved) throw new Error('Failed to save a corrected order item.')
      if (item.selectedOptions.length) {
        await trx.insert(schema.orderItemOptions).values(
          item.selectedOptions.map((selected: any) => ({
            orderItemId: saved.id,
            optionGroupId: selected.optionGroupId,
            optionChoiceId: selected.optionChoiceId,
            groupName: selected.groupName,
            choiceName: selected.choiceName,
            priceAdjustmentCents: selected.priceAdjustmentCents,
          })),
        )
      }
    }
    const totalPriceCents = linesToSave.reduce(
      (sum, item) => sum + item.priceCents * item.quantity,
      0,
    )
    const updated = (
      await trx
        .update(schema.orders)
        .set({
          totalPriceCents,
          version: sql`${schema.orders.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.orders.id, before.id),
            eq(schema.orders.version, input.version),
          ),
        )
        .returning({ id: schema.orders.id })
    ).at(0)
    if (!updated) throw new OrderConflictError()
    const after = await loadOrderSnapshot(before.id, trx)
    await trx.insert(schema.orderEvents).values({
      orderId: before.id,
      actorUserId: input.userId,
      type: 'ORDER_CORRECTED',
      reason,
      before,
      after,
    })
  })

  return getPublicOrder(input.orderId)
}

export async function cancelOrder(input: {
  orderId: string
  version: number
  userId: string
  userRole: string
  reason: string
}) {
  const reason = input.reason.trim().slice(0, 250)
  if (reason.length < 2) throw new Error('A cancellation reason is required.')
  if (!Number.isInteger(input.version) || input.version < 1) {
    throw new Error('A valid order version is required.')
  }

  await db.transaction(async (trx) => {
    await trx.execute(
      sql`select ${schema.orders.id} from ${schema.orders} where ${schema.orders.id} = ${input.orderId} for update`,
    )
    const before = await loadOrderSnapshot(input.orderId, trx)
    const activeSession = (
      await trx
        .select({ id: schema.sessions.id })
        .from(schema.sessions)
        .where(eq(schema.sessions.isActive, true))
        .limit(1)
    ).at(0)
    if (!activeSession || before.sessionId !== activeSession.id) {
      throw new Error('Cannot cancel an order from a closed session.')
    }
    const manager = isManager(input.userRole)
    const workerCanCancel =
      before.assignedWorkerId === input.userId &&
      (before.status === 'PENDING' || before.status === 'MAKING')
    if (!manager && !workerCanCancel) {
      throw new Error('You do not have permission to cancel this order.')
    }
    if (before.status === 'CANCELLED')
      throw new Error('Order is already cancelled.')
    if (!manager && before.status === 'READY') {
      throw new Error('Only owners or admins can cancel a ready order.')
    }
    if (before.version !== input.version) throw new OrderConflictError()

    const updated = (
      await trx
        .update(schema.orders)
        .set({
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledByUserId: input.userId,
          cancellationReason: reason,
          version: sql`${schema.orders.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.orders.id, before.id),
            eq(schema.orders.version, input.version),
          ),
        )
        .returning({ id: schema.orders.id })
    ).at(0)
    if (!updated) throw new OrderConflictError()
    const after = await loadOrderSnapshot(before.id, trx)
    await trx.insert(schema.orderEvents).values({
      orderId: before.id,
      actorUserId: input.userId,
      type: 'ORDER_CANCELLED',
      reason,
      before,
      after,
    })
  })

  return getPublicOrder(input.orderId)
}

export async function listOrderEvents(orderId: string) {
  return db
    .select({
      id: schema.orderEvents.id,
      type: schema.orderEvents.type,
      reason: schema.orderEvents.reason,
      before: schema.orderEvents.before,
      after: schema.orderEvents.after,
      createdAt: schema.orderEvents.createdAt,
      actorUserId: schema.orderEvents.actorUserId,
      actorName: schema.users.name,
    })
    .from(schema.orderEvents)
    .leftJoin(schema.users, eq(schema.users.id, schema.orderEvents.actorUserId))
    .where(eq(schema.orderEvents.orderId, orderId))
    .orderBy(schema.orderEvents.createdAt)
}

export async function assignOrderToUser(orderId: string, userId: string) {
  const session = await getActiveSession()
  await db.transaction(async (trx) => {
    await trx.execute(
      sql`select ${schema.orders.id} from ${schema.orders} where ${schema.orders.id} = ${orderId} for update`,
    )
    const before = await loadOrderSnapshot(orderId, trx)
    if (before.sessionId !== session.id) {
      throw new Error('Cannot assign order from a closed session.')
    }
    if (before.status === 'CANCELLED') {
      throw new Error('Cancelled orders cannot be assigned.')
    }
    if (before.assignedWorkerId && before.assignedWorkerId !== userId) {
      throw new Error('Order already assigned to another user.')
    }
    if (before.assignedWorkerId === userId) return

    const updated = (
      await trx
        .update(schema.orders)
        .set({
          assignedWorkerId: userId,
          assignedAt: new Date(),
          version: sql`${schema.orders.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.orders.id, orderId),
            isNull(schema.orders.assignedWorkerId),
          ),
        )
        .returning({ id: schema.orders.id })
    ).at(0)
    if (!updated) throw new Error('Order already assigned to another user.')
    const after = await loadOrderSnapshot(orderId, trx)
    await trx.insert(schema.orderEvents).values({
      orderId,
      actorUserId: userId,
      type: 'ORDER_ASSIGNED',
      before,
      after,
    })
  })

  return getPublicOrder(orderId)
}

export async function updateOrderStatus(input: {
  orderId: string
  status: 'PENDING' | 'MAKING' | 'READY'
  userId: string
  userRole?: string
}) {
  const session = await getActiveSession()
  const allowedStatuses = ['PENDING', 'MAKING', 'READY']
  if (!allowedStatuses.includes(input.status)) {
    throw new Error('Invalid status.')
  }
  await db.transaction(async (trx) => {
    await trx.execute(
      sql`select ${schema.orders.id} from ${schema.orders} where ${schema.orders.id} = ${input.orderId} for update`,
    )
    const before = await loadOrderSnapshot(input.orderId, trx)
    if (before.sessionId !== session.id) {
      throw new Error('Cannot update order from a closed session.')
    }
    const canEdit =
      before.assignedWorkerId === input.userId || isManager(input.userRole)
    if (!canEdit) throw new Error('You are not assigned to this order.')
    if (before.status === 'CANCELLED') {
      throw new Error('Cancelled orders cannot be updated.')
    }
    if (before.status === input.status) return

    const updated = (
      await trx
        .update(schema.orders)
        .set({
          status: input.status,
          version: sql`${schema.orders.version} + 1`,
          updatedAt: new Date(),
          ...(input.status === 'MAKING'
            ? { makingAt: sql`coalesce(${schema.orders.makingAt}, now())` }
            : {}),
          ...(input.status === 'READY'
            ? {
                fulfilledAt: sql`coalesce(${schema.orders.fulfilledAt}, now())`,
              }
            : {}),
        })
        .where(eq(schema.orders.id, input.orderId))
        .returning({ id: schema.orders.id })
    ).at(0)
    if (!updated) throw new Error('Failed to update status.')
    const after = await loadOrderSnapshot(input.orderId, trx)
    await trx.insert(schema.orderEvents).values({
      orderId: input.orderId,
      actorUserId: input.userId,
      type: 'ORDER_STATUS_CHANGED',
      reason: `${before.status} to ${input.status}`,
      before,
      after,
    })
  })

  return getPublicOrder(input.orderId)
}

export async function unassignOrder(orderId: string, userId: string) {
  const session = await getActiveSession()
  await db.transaction(async (trx) => {
    await trx.execute(
      sql`select ${schema.orders.id} from ${schema.orders} where ${schema.orders.id} = ${orderId} for update`,
    )
    const before = await loadOrderSnapshot(orderId, trx)
    if (before.sessionId !== session.id) {
      throw new Error('Cannot unassign order from a closed session.')
    }
    if (before.status === 'CANCELLED') {
      throw new Error('Cancelled orders cannot be unassigned.')
    }
    if (before.assignedWorkerId && before.assignedWorkerId !== userId) {
      throw new Error('Only the assigned worker can unassign this order.')
    }
    if (!before.assignedWorkerId) return

    const updated = (
      await trx
        .update(schema.orders)
        .set({
          assignedWorkerId: null,
          assignedAt: null,
          version: sql`${schema.orders.version} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(schema.orders.id, orderId))
        .returning({ id: schema.orders.id })
    ).at(0)
    if (!updated) throw new Error('Failed to unassign order.')
    const after = await loadOrderSnapshot(orderId, trx)
    await trx.insert(schema.orderEvents).values({
      orderId,
      actorUserId: userId,
      type: 'ORDER_UNASSIGNED',
      before,
      after,
    })
  })

  return getPublicOrder(orderId)
}
