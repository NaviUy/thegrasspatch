import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { db, schema } from '@/db/client'
import { getInventoryAvailability } from '@/lib/inventory'

type DatabaseClient = any

export type SessionInventoryItem = {
  menuItemId: string
  name: string
  priceCents: number
  imageUrl: string | null
  imagePlaceholderUrl: string | null
  badges: Array<{ label: string; color: string }> | null
  position: number | null
  isActive: boolean
  inventoryLimit: number | null
  quantitySold: number
  remainingQuantity: number | null
  manuallySoldOut: boolean
  isSoldOut: boolean
  isLimitedAvailability: boolean
}

export async function ensureSessionInventoryRows(
  sessionId: string,
  client: DatabaseClient = db,
) {
  const items = await client
    .select({ id: schema.menuItems.id })
    .from(schema.menuItems)

  if (items.length === 0) return

  await client
    .insert(schema.sessionMenuItems)
    .values(
      items.map((item: { id: string }) => ({
        sessionId,
        menuItemId: item.id,
      })),
    )
    .onConflictDoNothing()
}

async function soldQuantitiesByMenuItem(
  sessionId: string,
  menuItemIds: Array<string>,
  client: DatabaseClient = db,
) {
  if (menuItemIds.length === 0) return new Map<string, number>()

  const rows = await client
    .select({
      menuItemId: schema.orderItems.menuItemId,
      quantitySold: sql<number>`coalesce(sum(${schema.orderItems.quantity}), 0)::int`,
    })
    .from(schema.orderItems)
    .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId))
    .where(
      and(
        eq(schema.orders.sessionId, sessionId),
        inArray(schema.orderItems.menuItemId, menuItemIds),
      ),
    )
    .groupBy(schema.orderItems.menuItemId)

  return new Map<string, number>(
    rows.map((row: { menuItemId: string; quantitySold: number | string }) => [
      row.menuItemId,
      Number(row.quantitySold),
    ]),
  )
}

export async function listSessionInventory(
  sessionId: string,
  options: { includeInactive?: boolean; client?: DatabaseClient } = {},
): Promise<Array<SessionInventoryItem>> {
  const client = options.client ?? db
  await ensureSessionInventoryRows(sessionId, client)

  const rows = await client
    .select({
      menuItemId: schema.menuItems.id,
      name: schema.menuItems.name,
      defaultPriceCents: schema.menuItems.priceCents,
      sessionPriceCents: schema.sessionMenuItems.priceCents,
      imageUrl: schema.menuItems.imageUrl,
      imagePlaceholderUrl: schema.menuItems.imagePlaceholderUrl,
      badges: schema.menuItems.badges,
      position: schema.menuItems.position,
      isActive: schema.menuItems.isActive,
      inventoryLimit: schema.sessionMenuItems.inventoryLimit,
      manuallySoldOut: schema.sessionMenuItems.isSoldOut,
    })
    .from(schema.menuItems)
    .innerJoin(
      schema.sessionMenuItems,
      and(
        eq(schema.sessionMenuItems.sessionId, sessionId),
        eq(schema.sessionMenuItems.menuItemId, schema.menuItems.id),
      ),
    )
    .where(
      options.includeInactive ? undefined : eq(schema.menuItems.isActive, true),
    )
    .orderBy(asc(schema.menuItems.position), desc(schema.menuItems.createdAt))

  const soldByItem = await soldQuantitiesByMenuItem(
    sessionId,
    rows.map((row: { menuItemId: string }) => row.menuItemId),
    client,
  )

  return rows.map((row: any) => {
    const quantitySold = soldByItem.get(row.menuItemId) ?? 0
    const availability = getInventoryAvailability({
      inventoryLimit: row.inventoryLimit,
      quantitySold,
      manuallySoldOut: row.manuallySoldOut,
    })

    return {
      menuItemId: row.menuItemId,
      name: row.name,
      priceCents: row.sessionPriceCents ?? row.defaultPriceCents,
      imageUrl: row.imageUrl,
      imagePlaceholderUrl: row.imagePlaceholderUrl,
      badges: row.badges,
      position: row.position,
      isActive: row.isActive,
      inventoryLimit: row.inventoryLimit,
      quantitySold,
      remainingQuantity: availability.remainingQuantity,
      manuallySoldOut: row.manuallySoldOut,
      isSoldOut: availability.isSoldOut,
      isLimitedAvailability: availability.isLimitedAvailability,
    }
  })
}

export async function getActiveSessionInventory(
  options: {
    includeInactive?: boolean
  } = {},
) {
  const session = (
    await db
      .select({
        id: schema.sessions.id,
        name: schema.sessions.name,
        isActive: schema.sessions.isActive,
      })
      .from(schema.sessions)
      .where(eq(schema.sessions.isActive, true))
      .limit(1)
  ).at(0)

  if (!session) throw new Error('Active session not found.')

  const items = await listSessionInventory(session.id, options)
  return { session, items }
}

export async function updateActiveSessionInventory(input: {
  menuItemId: string
  inventoryLimit?: number | null
  isSoldOut?: boolean
}) {
  return db.transaction(async (trx) => {
    const session = (
      await trx
        .select({ id: schema.sessions.id })
        .from(schema.sessions)
        .where(eq(schema.sessions.isActive, true))
        .limit(1)
    ).at(0)

    if (!session) throw new Error('Active session not found.')

    await ensureSessionInventoryRows(session.id, trx)

    const inventoryRow = (
      await trx
        .select({ menuItemId: schema.sessionMenuItems.menuItemId })
        .from(schema.sessionMenuItems)
        .where(
          and(
            eq(schema.sessionMenuItems.sessionId, session.id),
            eq(schema.sessionMenuItems.menuItemId, input.menuItemId),
          ),
        )
        .for('update')
    ).at(0)

    if (!inventoryRow) throw new Error('Menu item not found.')

    if (
      input.inventoryLimit !== undefined &&
      input.inventoryLimit !== null &&
      (!Number.isInteger(input.inventoryLimit) || input.inventoryLimit < 0)
    ) {
      throw new Error('Inventory must be a nonnegative whole number.')
    }

    if (input.inventoryLimit !== undefined && input.inventoryLimit !== null) {
      const soldByItem = await soldQuantitiesByMenuItem(
        session.id,
        [input.menuItemId],
        trx,
      )
      const quantitySold = soldByItem.get(input.menuItemId) ?? 0
      if (input.inventoryLimit < quantitySold) {
        throw new Error(
          `Inventory cannot be lower than the ${quantitySold} already ordered.`,
        )
      }
    }

    await trx
      .update(schema.sessionMenuItems)
      .set({
        ...(input.inventoryLimit !== undefined
          ? { inventoryLimit: input.inventoryLimit }
          : {}),
        ...(input.isSoldOut !== undefined
          ? { isSoldOut: input.isSoldOut }
          : {}),
      })
      .where(
        and(
          eq(schema.sessionMenuItems.sessionId, session.id),
          eq(schema.sessionMenuItems.menuItemId, input.menuItemId),
        ),
      )

    const items = await listSessionInventory(session.id, {
      includeInactive: true,
      client: trx,
    })
    const item = items.find(
      (candidate) => candidate.menuItemId === input.menuItemId,
    )
    if (!item) throw new Error('Menu item not found.')
    return { sessionId: session.id, item }
  })
}

export async function lockSessionInventoryRows(
  sessionId: string,
  menuItemIds: Array<string>,
  client: DatabaseClient,
) {
  await ensureSessionInventoryRows(sessionId, client)
  if (menuItemIds.length === 0) return

  // Always lock in menu-item ID order to avoid deadlocks between checkouts.
  await client
    .select({ menuItemId: schema.sessionMenuItems.menuItemId })
    .from(schema.sessionMenuItems)
    .where(
      and(
        eq(schema.sessionMenuItems.sessionId, sessionId),
        inArray(schema.sessionMenuItems.menuItemId, [...menuItemIds].sort()),
      ),
    )
    .orderBy(asc(schema.sessionMenuItems.menuItemId))
    .for('update')
}
