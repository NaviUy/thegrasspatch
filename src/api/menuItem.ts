import { schema, db } from '@/db/client'
import { desc, eq, inArray } from 'drizzle-orm'

export type NewMenuItemInput = {
  name: string
  priceCents: number
  imageUrl?: string | null
  imagePlaceholderUrl?: string | null
  badges?: Array<{ label: string; color: string }> | null
  isActive?: boolean
}

export async function listMenuItems() {
  return await db
    .select()
    .from(schema.menuItems)
    .orderBy(desc(schema.menuItems.createdAt))
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
      isActive: input.isActive ?? true,
    })
    .returning()
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
    })
    .from(schema.sessions)
    .where(eq(schema.sessions.isActive, true))
    .limit(1)

  if (!session) {
    throw new Error('Active session not found.')
  }

  return session
}

export async function getActiveMenuItems() {
  const items = await db
    .select({
      id: schema.menuItems.id,
      name: schema.menuItems.name,
      priceCents: schema.menuItems.priceCents,
      imageUrl: schema.menuItems.imageUrl,
      imagePlaceholderUrl: schema.menuItems.imagePlaceholderUrl,
      badges: schema.menuItems.badges,
      isActive: schema.menuItems.isActive,
    })
    .from(schema.menuItems)
    .where(eq(schema.menuItems.isActive, true))

  return items
}

type RefreshCartItemInput = {
  menuItemId: string
  quantity: number
  name?: string
}

export async function refreshCartItems(
  items: RefreshCartItemInput[],
): Promise<{
  active: Array<{
    menuItemId: string
    name: string
    priceCents: number
    imageUrl: string | null
    quantity: number
  }>
  removed: Array<{
    menuItemId: string
    name?: string
    reason: 'NOT_FOUND' | 'INACTIVE'
  }>
}> {
  if (items.length === 0) {
    return { active: [], removed: [] }
  }

  const ids = items.map((i) => i.menuItemId)
  const dbItems = await db
    .select({
      id: schema.menuItems.id,
      name: schema.menuItems.name,
      priceCents: schema.menuItems.priceCents,
      imageUrl: schema.menuItems.imageUrl,
      isActive: schema.menuItems.isActive,
    })
    .from(schema.menuItems)
    .where(inArray(schema.menuItems.id, ids))

  const dbItemsMap = new Map(dbItems.map((item) => [item.id, item]))

  const active: {
    menuItemId: string
    name: string
    priceCents: number
    imageUrl: string | null
    quantity: number
  }[] = []
  const removed: {
    menuItemId: string
    name?: string
    reason: 'NOT_FOUND' | 'INACTIVE'
  }[] = []

  for (const item of items) {
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

    active.push({
      menuItemId: dbItem.id,
      name: dbItem.name,
      priceCents: dbItem.priceCents,
      imageUrl: dbItem.imageUrl,
      imagePlaceholderUrl: dbItem.imagePlaceholderUrl,
      quantity: item.quantity,
    })
  }

  return { active, removed }
}
