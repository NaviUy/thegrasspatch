import { asc, eq, inArray } from 'drizzle-orm'
import { db, schema } from '@/db/client'
import {
  buildSessionAnalyticsSummary,
  createSessionAnalyticsCsv,
} from '@/lib/sessionAnalytics'

async function loadSessionReport(sessionId: string) {
  const session = (
    await db
      .select({
        id: schema.sessions.id,
        name: schema.sessions.name,
        isActive: schema.sessions.isActive,
        createdAt: schema.sessions.createdAt,
      })
      .from(schema.sessions)
      .where(eq(schema.sessions.id, sessionId))
      .limit(1)
  ).at(0)
  if (!session) throw new Error('Session not found.')

  const orders = await db
    .select({
      id: schema.orders.id,
      orderNumber: schema.orders.orderNumber,
      customerName: schema.orders.customerName,
      status: schema.orders.status,
      totalPriceCents: schema.orders.totalPriceCents,
      checkoutTipCents: schema.orders.checkoutTipCents,
      postOrderTipCents: schema.orders.postOrderTipCents,
      tipAmountRefundedCents: schema.orders.tipAmountRefundedCents,
      createdAt: schema.orders.createdAt,
      updatedAt: schema.orders.updatedAt,
      fulfilledAt: schema.orders.fulfilledAt,
    })
    .from(schema.orders)
    .where(eq(schema.orders.sessionId, sessionId))
    .orderBy(asc(schema.orders.createdAt))

  const orderIds = orders.map((order) => order.id)
  const items = orderIds.length
    ? await db
        .select({
          id: schema.orderItems.id,
          orderId: schema.orderItems.orderId,
          menuItemId: schema.orderItems.menuItemId,
          itemName: schema.orderItems.itemName,
          quantity: schema.orderItems.quantity,
          unitPriceCents: schema.orderItems.unitPriceCents,
          specialInstructions: schema.orderItems.specialInstructions,
        })
        .from(schema.orderItems)
        .where(inArray(schema.orderItems.orderId, orderIds))
    : []

  const options = items.length
    ? await db
        .select({
          orderItemId: schema.orderItemOptions.orderItemId,
          groupName: schema.orderItemOptions.groupName,
          choiceName: schema.orderItemOptions.choiceName,
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
    session,
    orders: orders.map((order) => ({
      ...order,
      completedAt:
        order.status === 'READY'
          ? (order.fulfilledAt ?? order.updatedAt)
          : null,
    })),
    items: items.map((item) => ({
      ...item,
      options: options.filter((option) => option.orderItemId === item.id),
    })),
  }
}

export async function getSessionAnalytics(sessionId: string) {
  const report = await loadSessionReport(sessionId)
  const metrics = buildSessionAnalyticsSummary(
    report.orders.map((order) => ({
      id: order.id,
      status: order.status,
      totalPriceCents: order.totalPriceCents,
      createdAt: order.createdAt,
      completedAt: order.completedAt,
    })),
    report.items.map((item) => ({
      orderId: item.orderId,
      menuItemId: item.menuItemId,
      itemName: item.itemName,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
    })),
  )

  return {
    session: report.session,
    ...metrics,
    tips: {
      status: 'TRACKED' as const,
      totalCents: report.orders.reduce(
        (sum, order) =>
          sum +
          Math.max(
            0,
            order.checkoutTipCents +
              order.postOrderTipCents -
              order.tipAmountRefundedCents,
          ),
        0,
      ),
    },
  }
}

export async function getSessionAnalyticsCsv(sessionId: string) {
  const report = await loadSessionReport(sessionId)
  const ordersById = new Map(report.orders.map((order) => [order.id, order]))
  return {
    session: report.session,
    csv: createSessionAnalyticsCsv(
      report.items.map((item) => {
        const order = ordersById.get(item.orderId)!
        const preparationSeconds = order.completedAt
          ? Math.max(
              0,
              Math.round(
                (order.completedAt.getTime() - order.createdAt.getTime()) /
                  1000,
              ),
            )
          : null
        return {
          sessionName: report.session.name,
          orderNumber: order.orderNumber,
          placedAt: order.createdAt.toISOString(),
          customerName: order.customerName,
          status: order.status,
          itemName: item.itemName,
          options: item.options
            .map((option) => `${option.groupName}: ${option.choiceName}`)
            .join('; '),
          specialInstructions: item.specialInstructions ?? '',
          quantity: item.quantity,
          unitPrice: (item.unitPriceCents / 100).toFixed(2),
          lineTotal: ((item.unitPriceCents * item.quantity) / 100).toFixed(2),
          orderTotal: (order.totalPriceCents / 100).toFixed(2),
          preparationMinutes:
            preparationSeconds === null
              ? ''
              : (preparationSeconds / 60).toFixed(1),
          tipAmount: (
            Math.max(
              0,
              order.checkoutTipCents +
                order.postOrderTipCents -
                order.tipAmountRefundedCents,
            ) / 100
          ).toFixed(2),
          tipStatus: 'Tracked' as const,
        }
      }),
    ),
  }
}
