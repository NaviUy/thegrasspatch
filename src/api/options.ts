import { and, asc, eq, inArray, ne, notInArray, sql } from 'drizzle-orm'
import type { OptionGroupInput } from '@/lib/itemOptions'
import { db, schema } from '@/db/client'
import { getInventoryAvailability } from '@/lib/inventory'
import { validateOptionGroups } from '@/lib/itemOptions'

export type { OptionChoiceInput, OptionGroupInput } from '@/lib/itemOptions'

type DatabaseClient = any

export async function ensureSessionOptionInventoryRows(
  sessionId: string,
  client: DatabaseClient = db,
) {
  const choices = await client
    .select({ id: schema.menuItemOptionChoices.id })
    .from(schema.menuItemOptionChoices)
  if (!choices.length) return
  await client
    .insert(schema.sessionOptionChoices)
    .values(
      choices.map((choice: { id: string }) => ({
        sessionId,
        optionChoiceId: choice.id,
      })),
    )
    .onConflictDoNothing()
}

async function soldQuantitiesByChoice(
  sessionId: string,
  choiceIds: Array<string>,
  client: DatabaseClient = db,
  excludeOrderId?: string,
) {
  if (!choiceIds.length) return new Map<string, number>()
  const rows = await client
    .select({
      optionChoiceId: schema.orderItemOptions.optionChoiceId,
      quantitySold: sql<number>`coalesce(sum(${schema.orderItems.quantity}), 0)::int`,
    })
    .from(schema.orderItemOptions)
    .innerJoin(
      schema.orderItems,
      eq(schema.orderItems.id, schema.orderItemOptions.orderItemId),
    )
    .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId))
    .where(
      and(
        eq(schema.orders.sessionId, sessionId),
        ne(schema.orders.status, 'CANCELLED'),
        excludeOrderId ? ne(schema.orders.id, excludeOrderId) : undefined,
        inArray(schema.orderItemOptions.optionChoiceId, choiceIds),
      ),
    )
    .groupBy(schema.orderItemOptions.optionChoiceId)
  return new Map<string, number>(
    rows.map((row: any) => [row.optionChoiceId, Number(row.quantitySold)]),
  )
}

export async function getOptionsForMenuItems(
  menuItemIds: Array<string>,
  options: {
    sessionId?: string
    includeInactive?: boolean
    client?: DatabaseClient
    excludeOrderId?: string
  } = {},
) {
  if (!menuItemIds.length) return new Map<string, Array<any>>()
  const client = options.client ?? db
  const groups = await client
    .select()
    .from(schema.menuItemOptionGroups)
    .where(
      and(
        inArray(schema.menuItemOptionGroups.menuItemId, menuItemIds),
        options.includeInactive
          ? undefined
          : eq(schema.menuItemOptionGroups.isActive, true),
      ),
    )
    .orderBy(asc(schema.menuItemOptionGroups.position))
  if (!groups.length) return new Map<string, Array<any>>()

  const choices = await client
    .select()
    .from(schema.menuItemOptionChoices)
    .where(
      and(
        inArray(
          schema.menuItemOptionChoices.groupId,
          groups.map((group: any) => group.id),
        ),
        options.includeInactive
          ? undefined
          : eq(schema.menuItemOptionChoices.isActive, true),
      ),
    )
    .orderBy(asc(schema.menuItemOptionChoices.position))

  let inventoryByChoice = new Map<string, any>()
  let soldByChoice = new Map<string, number>()
  if (options.sessionId) {
    await ensureSessionOptionInventoryRows(options.sessionId, client)
    const inventoryRows = await client
      .select()
      .from(schema.sessionOptionChoices)
      .where(
        and(
          eq(schema.sessionOptionChoices.sessionId, options.sessionId),
          inArray(
            schema.sessionOptionChoices.optionChoiceId,
            choices.map((choice: any) => choice.id),
          ),
        ),
      )
    inventoryByChoice = new Map(
      inventoryRows.map((row: any) => [row.optionChoiceId, row]),
    )
    soldByChoice = await soldQuantitiesByChoice(
      options.sessionId,
      choices.map((choice: any) => choice.id),
      client,
      options.excludeOrderId,
    )
  }

  const choicesByGroup = new Map<string, Array<any>>()
  for (const choice of choices) {
    const inventory = inventoryByChoice.get(choice.id)
    const quantitySold = soldByChoice.get(choice.id) ?? 0
    const availability = getInventoryAvailability({
      inventoryLimit: inventory?.inventoryLimit ?? null,
      quantitySold,
      manuallySoldOut: inventory?.isSoldOut ?? false,
    })
    const enriched = {
      ...choice,
      inventoryLimit: inventory?.inventoryLimit ?? null,
      quantitySold,
      remainingQuantity: availability.remainingQuantity,
      manuallySoldOut: inventory?.isSoldOut ?? false,
      isSoldOut: availability.isSoldOut,
      isLimitedAvailability: availability.isLimitedAvailability,
    }
    choicesByGroup.set(choice.groupId, [
      ...(choicesByGroup.get(choice.groupId) ?? []),
      enriched,
    ])
  }

  const byMenuItem = new Map<string, Array<any>>()
  for (const group of groups) {
    byMenuItem.set(group.menuItemId, [
      ...(byMenuItem.get(group.menuItemId) ?? []),
      { ...group, choices: choicesByGroup.get(group.id) ?? [] },
    ])
  }
  return byMenuItem
}

export async function replaceMenuItemOptions(
  menuItemId: string,
  groups: Array<OptionGroupInput>,
  client?: DatabaseClient,
) {
  validateOptionGroups(groups)
  const replace = async (trx: DatabaseClient) => {
    const activeSession = (
      await trx
        .select({ id: schema.sessions.id })
        .from(schema.sessions)
        .where(eq(schema.sessions.isActive, true))
        .limit(1)
    ).at(0)
    const existingGroups = await trx
      .select({ id: schema.menuItemOptionGroups.id })
      .from(schema.menuItemOptionGroups)
      .where(eq(schema.menuItemOptionGroups.menuItemId, menuItemId))
    const existingGroupIds = new Set(
      existingGroups.map((group: { id: string }) => group.id),
    )
    const retainedGroupIds: Array<string> = []

    for (
      let groupPosition = 0;
      groupPosition < groups.length;
      groupPosition++
    ) {
      const group = groups[groupPosition]
      const groupValues = {
        menuItemId,
        name: group.name.trim(),
        selectionType: group.selectionType,
        isRequired: group.isRequired,
        minSelections: group.minSelections,
        maxSelections: group.maxSelections,
        position: groupPosition,
        isActive: group.isActive,
      }
      const savedGroup =
        group.id && existingGroupIds.has(group.id)
          ? (
              await trx
                .update(schema.menuItemOptionGroups)
                .set(groupValues)
                .where(eq(schema.menuItemOptionGroups.id, group.id))
                .returning()
            ).at(0)
          : (
              await trx
                .insert(schema.menuItemOptionGroups)
                .values(groupValues)
                .returning()
            ).at(0)
      if (!savedGroup) throw new Error('Failed to save option group.')
      retainedGroupIds.push(savedGroup.id)

      const existingChoices = await trx
        .select({ id: schema.menuItemOptionChoices.id })
        .from(schema.menuItemOptionChoices)
        .where(eq(schema.menuItemOptionChoices.groupId, savedGroup.id))
      const existingChoiceIds = new Set(
        existingChoices.map((choice: { id: string }) => choice.id),
      )
      const retainedChoiceIds: Array<string> = []
      for (
        let choicePosition = 0;
        choicePosition < group.choices.length;
        choicePosition++
      ) {
        const choice = group.choices[choicePosition]
        const choiceValues = {
          groupId: savedGroup.id,
          name: choice.name.trim(),
          priceAdjustmentCents: choice.priceAdjustmentCents,
          isDefault: choice.isDefault,
          isActive: choice.isActive,
          position: choicePosition,
        }
        const savedChoice =
          choice.id && existingChoiceIds.has(choice.id)
            ? (
                await trx
                  .update(schema.menuItemOptionChoices)
                  .set(choiceValues)
                  .where(eq(schema.menuItemOptionChoices.id, choice.id))
                  .returning()
              ).at(0)
            : (
                await trx
                  .insert(schema.menuItemOptionChoices)
                  .values(choiceValues)
                  .returning()
              ).at(0)
        if (!savedChoice) throw new Error('Failed to save option choice.')
        retainedChoiceIds.push(savedChoice.id)
        if (
          activeSession &&
          (choice.inventoryLimit !== undefined ||
            choice.isSoldOut !== undefined)
        ) {
          if (
            choice.inventoryLimit !== undefined &&
            choice.inventoryLimit !== null
          ) {
            const quantitySold =
              (
                await soldQuantitiesByChoice(
                  activeSession.id,
                  [savedChoice.id],
                  trx,
                )
              ).get(savedChoice.id) ?? 0
            if (choice.inventoryLimit < quantitySold) {
              throw new Error(
                `Inventory for “${choice.name}” cannot be lower than the ${quantitySold} already ordered.`,
              )
            }
          }
          const inventoryValues = {
            sessionId: activeSession.id,
            optionChoiceId: savedChoice.id,
            inventoryLimit: choice.inventoryLimit ?? null,
            isSoldOut: choice.isSoldOut ?? false,
          }
          await trx
            .insert(schema.sessionOptionChoices)
            .values(inventoryValues)
            .onConflictDoUpdate({
              target: [
                schema.sessionOptionChoices.sessionId,
                schema.sessionOptionChoices.optionChoiceId,
              ],
              set: {
                ...(choice.inventoryLimit !== undefined
                  ? { inventoryLimit: choice.inventoryLimit }
                  : {}),
                ...(choice.isSoldOut !== undefined
                  ? { isSoldOut: choice.isSoldOut }
                  : {}),
              },
            })
        }
      }
      if (existingChoices.length) {
        await trx
          .delete(schema.menuItemOptionChoices)
          .where(
            and(
              eq(schema.menuItemOptionChoices.groupId, savedGroup.id),
              retainedChoiceIds.length
                ? notInArray(schema.menuItemOptionChoices.id, retainedChoiceIds)
                : undefined,
            ),
          )
      }
    }
    if (existingGroups.length) {
      await trx
        .delete(schema.menuItemOptionGroups)
        .where(
          and(
            eq(schema.menuItemOptionGroups.menuItemId, menuItemId),
            retainedGroupIds.length
              ? notInArray(schema.menuItemOptionGroups.id, retainedGroupIds)
              : undefined,
          ),
        )
    }

    const sessions = await trx
      .select({ id: schema.sessions.id })
      .from(schema.sessions)
    for (const session of sessions) {
      await ensureSessionOptionInventoryRows(session.id, trx)
    }
    return getOptionsForMenuItems([menuItemId], {
      includeInactive: true,
      client: trx,
    })
  }
  return client ? replace(client) : db.transaction(replace)
}

export async function updateActiveOptionInventory(input: {
  optionChoiceId: string
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
    await ensureSessionOptionInventoryRows(session.id, trx)
    const row = (
      await trx
        .select()
        .from(schema.sessionOptionChoices)
        .where(
          and(
            eq(schema.sessionOptionChoices.sessionId, session.id),
            eq(
              schema.sessionOptionChoices.optionChoiceId,
              input.optionChoiceId,
            ),
          ),
        )
        .for('update')
    ).at(0)
    if (!row) throw new Error('Option choice not found.')
    if (
      input.inventoryLimit !== undefined &&
      input.inventoryLimit !== null &&
      (!Number.isInteger(input.inventoryLimit) || input.inventoryLimit < 0)
    )
      throw new Error('Inventory must be a nonnegative whole number.')
    if (input.inventoryLimit !== undefined && input.inventoryLimit !== null) {
      const sold =
        (
          await soldQuantitiesByChoice(session.id, [input.optionChoiceId], trx)
        ).get(input.optionChoiceId) ?? 0
      if (input.inventoryLimit < sold) {
        throw new Error(
          `Inventory cannot be lower than the ${sold} already ordered.`,
        )
      }
    }
    await trx
      .update(schema.sessionOptionChoices)
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
          eq(schema.sessionOptionChoices.sessionId, session.id),
          eq(schema.sessionOptionChoices.optionChoiceId, input.optionChoiceId),
        ),
      )
    return { ok: true }
  })
}

export async function lockSessionOptionInventoryRows(
  sessionId: string,
  choiceIds: Array<string>,
  client: DatabaseClient,
) {
  await ensureSessionOptionInventoryRows(sessionId, client)
  if (!choiceIds.length) return
  await client
    .select({ id: schema.sessionOptionChoices.optionChoiceId })
    .from(schema.sessionOptionChoices)
    .where(
      and(
        eq(schema.sessionOptionChoices.sessionId, sessionId),
        inArray(
          schema.sessionOptionChoices.optionChoiceId,
          [...new Set(choiceIds)].sort(),
        ),
      ),
    )
    .orderBy(asc(schema.sessionOptionChoices.optionChoiceId))
    .for('update')
}
