import { asc, desc, eq } from 'drizzle-orm'
import { ensureSessionInventoryRows, listSessionInventory } from './inventory'
import { db, schema } from '@/db/client'
import { getAvailableCartQuantity } from '@/lib/inventory'

export type NewMenuItemInput = {
  name: string
  priceCents: number
  imageUrl?: string | null
  imagePlaceholderUrl?: string | null
  badges?: Array<{ label: string; color: string }> | null
  position?: number | null
  isActive?: boolean
}

export async function listMenuItems() {
  return await db
    .select()
    .from(schema.menuItems)
    .orderBy(asc(schema.menuItems.position), desc(schema.menuItems.createdAt))
}

export async function createMenuItem(input: NewMenuItemInput) {
  const [item] = await db
    .insert(schema.menuItems)
    .values({
      name: input.name,
      priceCents: input.priceCents,
      imageUrl: input.imageUrl ?? null,
      imagePlaceholderUrl: input.imagePlaceholderUrl ?? null,
      badges: input.badges ?? null,
      position: input.position ?? Date.now(),
      isActive: input.isActive ?? true,
    })
    .returning()

  const sessions = await db
    .select({ id: schema.sessions.id })
    .from(schema.sessions)
  for (const session of sessions) {
    await ensureSessionInventoryRows(session.id)
  }
  return item
}

export async function updateMenuItem(
  id: string,
  updates: Partial<NewMenuItemInput>,
) {
  const [item] = await db
    .update(schema.menuItems)
    .set({
      ...(updates.name !== undefined ? { name: updates.name } : {}),
      ...(updates.priceCents !== undefined
        ? { priceCents: updates.priceCents }
        : {}),
      ...(updates.imageUrl !== undefined ? { imageUrl: updates.imageUrl } : {}),
      ...(updates.imagePlaceholderUrl !== undefined
        ? { imagePlaceholderUrl: updates.imagePlaceholderUrl }
        : {}),
      ...(updates.badges !== undefined ? { badges: updates.badges } : {}),
      ...(updates.isActive !== undefined ? { isActive: updates.isActive } : {}),
      ...(updates.position !== undefined ? { position: updates.position } : {}),
    })
    .where(eq(schema.menuItems.id, id))
    .returning()

  if (!item) {
    throw new Error('Menu item was not found.')
  }

  return item
}

export async function deleteMenuItem(id: string) {
  const [item] = await db
    .delete(schema.menuItems)
    .where(eq(schema.menuItems.id, id))
    .returning()

  if (!item) {
    throw new Error('Menu item not found.')
  }

  return item
}

export async function getActiveSession() {
  const [session] = await db
    .select({
      id: schema.sessions.id,
      name: schema.sessions.name,
      isActive: schema.sessions.isActive,
    })
    .from(schema.sessions)
    .where(eq(schema.sessions.isActive, true))
    .limit(1)

  if (!session) {
    throw new Error('Active session not found.')
  }

  return session
}

export async function reorderMenuItems(ids: Array<string>) {
  const updates: Array<any> = []
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]
    const position = i + 1
    const [item] = await db
      .update(schema.menuItems)
      .set({ position })
      .where(eq(schema.menuItems.id, id))
      .returning()
    if (item) updates.push(item)
  }
  return updates
}

export async function getActiveMenuItems() {
  const session = await getActiveSession()
  const items = await listSessionInventory(session.id)
  return items.map((item) => ({
    id: item.menuItemId,
    name: item.name,
    priceCents: item.priceCents,
    imageUrl: item.imageUrl,
    imagePlaceholderUrl: item.imagePlaceholderUrl,
    badges: item.badges,
    position: item.position,
    isActive: item.isActive,
    isSoldOut: item.isSoldOut,
    isLimitedAvailability: item.isLimitedAvailability,
    availableQuantity: item.remainingQuantity,
  }))
}

type RefreshCartItemInput = {
  menuItemId: string
  quantity: number
  name?: string
}

export async function refreshCartItems(
  items: Array<RefreshCartItemInput>,
  options: { sessionId?: string; client?: any } = {},
): Promise<{
  active: Array<{
    menuItemId: string
    name: string
    priceCents: number
    imageUrl: string | null
    imagePlaceholderUrl: string | null
    quantity: number
    remainingQuantity: number | null
  }>
  removed: Array<{
    menuItemId: string
    name?: string
    reason: 'NOT_FOUND' | 'INACTIVE' | 'SOLD_OUT'
  }>
  adjusted: Array<{
    menuItemId: string
    name: string
    requestedQuantity: number
    availableQuantity: number
    reason: 'LIMITED_AVAILABILITY'
  }>
}> {
  if (items.length === 0) {
    return { active: [], removed: [], adjusted: [] }
  }

  const requestedItems = new Map<string, RefreshCartItemInput>()
  for (const item of items) {
    const existing = requestedItems.get(item.menuItemId)
    requestedItems.set(item.menuItemId, {
      ...item,
      name: item.name ?? existing?.name,
      quantity: (existing?.quantity ?? 0) + item.quantity,
    })
  }

  const sessionId = options.sessionId ?? (await getActiveSession()).id
  const inventory = await listSessionInventory(sessionId, {
    includeInactive: true,
    client: options.client,
  })
  const dbItemsMap = new Map(inventory.map((item) => [item.menuItemId, item]))

  const active: Array<{
    menuItemId: string
    name: string
    priceCents: number
    imageUrl: string | null
    imagePlaceholderUrl: string | null
    quantity: number
    remainingQuantity: number | null
  }> = []
  const removed: Array<{
    menuItemId: string
    name?: string
    reason: 'NOT_FOUND' | 'INACTIVE' | 'SOLD_OUT'
  }> = []
  const adjusted: Array<{
    menuItemId: string
    name: string
    requestedQuantity: number
    availableQuantity: number
    reason: 'LIMITED_AVAILABILITY'
  }> = []

  for (const item of requestedItems.values()) {
    const dbItem = dbItemsMap.get(item.menuItemId)
    if (!dbItem) {
      removed.push({
        menuItemId: item.menuItemId,
        name: item.name,
        reason: 'NOT_FOUND',
      })
      continue
    }

    if (!dbItem.isActive) {
      removed.push({
        menuItemId: item.menuItemId,
        name: dbItem.name,
        reason: 'INACTIVE',
      })
      continue
    }

    if (dbItem.isSoldOut) {
      removed.push({
        menuItemId: item.menuItemId,
        name: dbItem.name,
        reason: 'SOLD_OUT',
      })
      continue
    }

    const quantity = getAvailableCartQuantity(item.quantity, dbItem)

    if (quantity < item.quantity) {
      adjusted.push({
        menuItemId: dbItem.menuItemId,
        name: dbItem.name,
        requestedQuantity: item.quantity,
        availableQuantity: quantity,
        reason: 'LIMITED_AVAILABILITY',
      })
    }

    active.push({
      menuItemId: dbItem.menuItemId,
      name: dbItem.name,
      priceCents: dbItem.priceCents,
      imageUrl: dbItem.imageUrl,
      imagePlaceholderUrl: dbItem.imagePlaceholderUrl,
      quantity,
      remainingQuantity: dbItem.remainingQuantity,
    })
  }

  return { active, removed, adjusted }
}
