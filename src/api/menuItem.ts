import { asc, desc, eq, sql } from 'drizzle-orm'
import { ensureSessionInventoryRows, listSessionInventory } from './inventory'
import { getOptionsForMenuItems, replaceMenuItemOptions } from './options'
import type { OptionGroupInput } from './options'
import { db, schema } from '@/db/client'
import { getAvailableCartQuantity } from '@/lib/inventory'

export type NewMenuItemInput = {
  name: string
  priceCents: number
  imageUrl?: string | null
  originalImageUrl?: string | null
  imagePlaceholderUrl?: string | null
  badges?: Array<{ label: string; color: string }> | null
  position?: number | null
  isActive?: boolean
}

export async function listMenuItems() {
  const items = await db
    .select()
    .from(schema.menuItems)
    .orderBy(asc(schema.menuItems.position), desc(schema.menuItems.createdAt))
  const session = await getActiveSession().catch(() => null)
  const options = await getOptionsForMenuItems(
    items.map((item) => item.id),
    { includeInactive: true, sessionId: session?.id },
  )
  return items.map((item) => ({ ...item, options: options.get(item.id) ?? [] }))
}

export async function createMenuItem(input: NewMenuItemInput) {
  const [positionResult] = await db
    .select({
      maxPosition: sql<number>`coalesce(max(${schema.menuItems.position}), 0)`,
    })
    .from(schema.menuItems)

  const [item] = await db
    .insert(schema.menuItems)
    .values({
      name: input.name,
      priceCents: input.priceCents,
      imageUrl: input.imageUrl ?? null,
      originalImageUrl: input.originalImageUrl ?? null,
      imagePlaceholderUrl: input.imagePlaceholderUrl ?? null,
      badges: input.badges ?? null,
      position: input.position ?? Number(positionResult.maxPosition) + 1,
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
  client: any = db,
) {
  const [item] = await client
    .update(schema.menuItems)
    .set({
      ...(updates.name !== undefined ? { name: updates.name } : {}),
      ...(updates.priceCents !== undefined
        ? { priceCents: updates.priceCents }
        : {}),
      ...(updates.imageUrl !== undefined ? { imageUrl: updates.imageUrl } : {}),
      ...(updates.originalImageUrl !== undefined
        ? { originalImageUrl: updates.originalImageUrl }
        : {}),
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

export async function updateMenuItemWithOptions(
  id: string,
  updates: Partial<NewMenuItemInput>,
  options: Array<OptionGroupInput>,
) {
  return db.transaction(async (trx) => {
    const item = await updateMenuItem(id, updates, trx)
    await replaceMenuItemOptions(id, options, trx)
    return item
  })
}

export async function deleteMenuItem(id: string) {
  const item = (
    await db
      .delete(schema.menuItems)
      .where(eq(schema.menuItems.id, id))
      .returning()
  ).at(0)

  if (!item) {
    throw new Error('Menu item not found.')
  }

  return item
}

export async function getActiveSession() {
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
    const item = (
      await db
        .update(schema.menuItems)
        .set({ position })
        .where(eq(schema.menuItems.id, id))
        .returning()
    ).at(0)
    if (item) updates.push(item)
  }
  return updates
}

export async function getActiveMenuItems() {
  const session = await getActiveSession()
  const items = await listSessionInventory(session.id)
  const options = await getOptionsForMenuItems(
    items.map((item) => item.menuItemId),
    { sessionId: session.id },
  )
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
    options: options.get(item.menuItemId) ?? [],
  }))
}

type RefreshCartItemInput = {
  cartLineId: string
  menuItemId: string
  quantity: number
  name?: string
  selectedOptionChoiceIds?: Array<string>
  specialInstructions?: string
}

export async function refreshCartItems(
  items: Array<RefreshCartItemInput>,
  options: {
    sessionId?: string
    client?: any
    excludeOrderId?: string
    preservedLines?: Array<{
      lineId: string
      menuItemId: string
      quantity: number
      selectedOptionChoiceIds: Array<string>
    }>
  } = {},
): Promise<{
  active: Array<{
    menuItemId: string
    cartLineId: string
    name: string
    priceCents: number
    basePriceCents: number
    imageUrl: string | null
    imagePlaceholderUrl: string | null
    quantity: number
    remainingQuantity: number | null
    specialInstructions: string
    selectedOptions: Array<{
      optionGroupId: string
      optionChoiceId: string
      groupName: string
      choiceName: string
      priceAdjustmentCents: number
    }>
  }>
  removed: Array<{
    menuItemId: string
    cartLineId: string
    name?: string
    reason: 'NOT_FOUND' | 'INACTIVE' | 'SOLD_OUT' | 'OPTION_UNAVAILABLE'
  }>
  adjusted: Array<{
    menuItemId: string
    cartLineId: string
    name: string
    requestedQuantity: number
    availableQuantity: number
    reason: 'LIMITED_AVAILABILITY'
  }>
}> {
  if (items.length === 0) {
    return { active: [], removed: [], adjusted: [] }
  }

  const sessionId = options.sessionId ?? (await getActiveSession()).id
  const inventory = await listSessionInventory(sessionId, {
    includeInactive: true,
    client: options.client,
    excludeOrderId: options.excludeOrderId,
  })
  const dbItemsMap = new Map(inventory.map((item) => [item.menuItemId, item]))
  const optionGroupsByItem = await getOptionsForMenuItems(
    inventory.map((item) => item.menuItemId),
    {
      sessionId,
      client: options.client,
      excludeOrderId: options.excludeOrderId,
      includeInactive: !!options.preservedLines,
    },
  )
  const preservedByLine = new Map(
    (options.preservedLines ?? []).map((line) => [line.lineId, line]),
  )
  const remainingByItem = new Map(
    inventory.map((item) => [item.menuItemId, item.remainingQuantity]),
  )
  const remainingByChoice = new Map<string, number | null>()
  for (const groups of optionGroupsByItem.values()) {
    for (const group of groups) {
      for (const choice of group.choices) {
        remainingByChoice.set(choice.id, choice.remainingQuantity)
      }
    }
  }

  const active: Array<{
    menuItemId: string
    cartLineId: string
    name: string
    priceCents: number
    basePriceCents: number
    imageUrl: string | null
    imagePlaceholderUrl: string | null
    quantity: number
    remainingQuantity: number | null
    specialInstructions: string
    selectedOptions: Array<any>
  }> = []
  const removed: Array<{
    menuItemId: string
    cartLineId: string
    name?: string
    reason: 'NOT_FOUND' | 'INACTIVE' | 'SOLD_OUT' | 'OPTION_UNAVAILABLE'
  }> = []
  const adjusted: Array<{
    menuItemId: string
    cartLineId: string
    name: string
    requestedQuantity: number
    availableQuantity: number
    reason: 'LIMITED_AVAILABILITY'
  }> = []

  for (const item of items) {
    const dbItem = dbItemsMap.get(item.menuItemId)
    const preserved = preservedByLine.get(item.cartLineId)
    const canKeepBaseReservation =
      preserved?.menuItemId === item.menuItemId &&
      item.quantity <= preserved.quantity
    if (!dbItem) {
      removed.push({
        menuItemId: item.menuItemId,
        cartLineId: item.cartLineId,
        name: item.name,
        reason: 'NOT_FOUND',
      })
      continue
    }

    if (!dbItem.isActive && !canKeepBaseReservation) {
      removed.push({
        menuItemId: item.menuItemId,
        cartLineId: item.cartLineId,
        name: dbItem.name,
        reason: 'INACTIVE',
      })
      continue
    }

    if (dbItem.isSoldOut && !canKeepBaseReservation) {
      removed.push({
        menuItemId: item.menuItemId,
        cartLineId: item.cartLineId,
        name: dbItem.name,
        reason: 'SOLD_OUT',
      })
      continue
    }

    const groups = optionGroupsByItem.get(item.menuItemId) ?? []
    const selectedIds = [...new Set(item.selectedOptionChoiceIds ?? [])]
    const allChoices = groups.flatMap((group: any) => group.choices)
    const choiceMap = new Map(
      allChoices.map((choice: any) => [choice.id, choice]),
    )
    const invalidChoice = selectedIds.some((id) => {
      const choice: any = choiceMap.get(id)
      const canKeepChoice =
        canKeepBaseReservation && preserved.selectedOptionChoiceIds.includes(id)
      return (
        !choice || ((!choice.isActive || choice.isSoldOut) && !canKeepChoice)
      )
    })
    const invalidGroup = groups.some((group: any) => {
      if (!group.isActive) return false
      const count = group.choices.filter((choice: any) =>
        selectedIds.includes(choice.id),
      ).length
      const minimum = group.isRequired
        ? Math.max(1, group.minSelections)
        : group.minSelections
      return (
        count < minimum ||
        (group.maxSelections !== null && count > group.maxSelections)
      )
    })
    if (invalidChoice || invalidGroup) {
      removed.push({
        menuItemId: item.menuItemId,
        cartLineId: item.cartLineId,
        name: dbItem.name,
        reason: 'OPTION_UNAVAILABLE',
      })
      continue
    }

    const selectedOptions = selectedIds.map((id) => {
      const choice: any = choiceMap.get(id)
      const group: any = groups.find(
        (candidate: any) => candidate.id === choice.groupId,
      )
      return {
        optionGroupId: group.id,
        optionChoiceId: choice.id,
        groupName: group.name,
        choiceName: choice.name,
        priceAdjustmentCents: choice.priceAdjustmentCents,
      }
    })
    const baseRemaining = remainingByItem.get(item.menuItemId) ?? null
    let quantity = canKeepBaseReservation
      ? baseRemaining === null
        ? item.quantity
        : Math.min(item.quantity, Math.max(baseRemaining, preserved.quantity))
      : getAvailableCartQuantity(item.quantity, {
          ...dbItem,
          remainingQuantity: baseRemaining,
        })
    for (const selected of selectedOptions) {
      const remaining = remainingByChoice.get(selected.optionChoiceId) ?? null
      if (remaining !== null) {
        const canKeepChoice =
          canKeepBaseReservation &&
          preserved.selectedOptionChoiceIds.includes(selected.optionChoiceId)
        quantity = Math.min(
          quantity,
          canKeepChoice ? Math.max(remaining, preserved.quantity) : remaining,
        )
      }
    }
    if (quantity <= 0) {
      removed.push({
        menuItemId: item.menuItemId,
        cartLineId: item.cartLineId,
        name: dbItem.name,
        reason: 'OPTION_UNAVAILABLE',
      })
      continue
    }

    if (quantity < item.quantity) {
      adjusted.push({
        menuItemId: dbItem.menuItemId,
        cartLineId: item.cartLineId,
        name: dbItem.name,
        requestedQuantity: item.quantity,
        availableQuantity: quantity,
        reason: 'LIMITED_AVAILABILITY',
      })
    }

    active.push({
      menuItemId: dbItem.menuItemId,
      cartLineId: item.cartLineId,
      name: dbItem.name,
      basePriceCents: dbItem.priceCents,
      priceCents:
        dbItem.priceCents +
        selectedOptions.reduce(
          (sum, selected) => sum + selected.priceAdjustmentCents,
          0,
        ),
      imageUrl: dbItem.imageUrl,
      imagePlaceholderUrl: dbItem.imagePlaceholderUrl,
      quantity,
      remainingQuantity: dbItem.remainingQuantity,
      specialInstructions: (item.specialInstructions ?? '')
        .trim()
        .slice(0, 200),
      selectedOptions,
    })
    const updatedBaseRemaining = remainingByItem.get(item.menuItemId)
    if (updatedBaseRemaining !== null && updatedBaseRemaining !== undefined) {
      remainingByItem.set(item.menuItemId, updatedBaseRemaining - quantity)
    }
    for (const selected of selectedOptions) {
      const remaining = remainingByChoice.get(selected.optionChoiceId)
      if (remaining !== null && remaining !== undefined) {
        remainingByChoice.set(selected.optionChoiceId, remaining - quantity)
      }
    }
  }

  return { active, removed, adjusted }
}
