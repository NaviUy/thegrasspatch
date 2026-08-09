export type AnalyticsOrderInput = {
  id: string
  status: string
  totalPriceCents: number
  createdAt: Date
  completedAt: Date | null
}

export type AnalyticsItemInput = {
  menuItemId: string
  itemName: string
  quantity: number
  unitPriceCents: number
}

export function buildSessionAnalyticsSummary(
  orders: Array<AnalyticsOrderInput>,
  items: Array<AnalyticsItemInput>,
) {
  const completedOrders = orders.filter((order) => order.status === 'READY')
  const preparationTimes = completedOrders
    .filter((order) => order.completedAt !== null)
    .map((order) =>
      Math.max(
        0,
        Math.round(
          (order.completedAt!.getTime() - order.createdAt.getTime()) / 1000,
        ),
      ),
    )

  const productMap = new Map<
    string,
    {
      menuItemId: string
      name: string
      quantity: number
      revenueCents: number
    }
  >()
  for (const item of items) {
    const existing = productMap.get(item.menuItemId)
    productMap.set(item.menuItemId, {
      menuItemId: item.menuItemId,
      name: existing?.name ?? item.itemName,
      quantity: (existing?.quantity ?? 0) + item.quantity,
      revenueCents:
        (existing?.revenueCents ?? 0) + item.quantity * item.unitPriceCents,
    })
  }

  return {
    summary: {
      orderCount: orders.length,
      itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
      revenueCents: orders.reduce(
        (sum, order) => sum + order.totalPriceCents,
        0,
      ),
      completedOrderCount: completedOrders.length,
      outstandingOrderCount: orders.length - completedOrders.length,
      averagePreparationSeconds: preparationTimes.length
        ? Math.round(
            preparationTimes.reduce((sum, seconds) => sum + seconds, 0) /
              preparationTimes.length,
          )
        : null,
    },
    popularProducts: [...productMap.values()].sort(
      (a, b) =>
        b.quantity - a.quantity ||
        b.revenueCents - a.revenueCents ||
        a.name.localeCompare(b.name),
    ),
  }
}

function csvCell(value: string | number | null) {
  if (value === null) return ''
  const text = String(value)
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export type SessionAnalyticsCsvRow = {
  sessionName: string
  orderNumber: number
  placedAt: string
  customerName: string
  status: string
  itemName: string
  options: string
  specialInstructions: string
  quantity: number
  unitPrice: string
  lineTotal: string
  orderTotal: string
  preparationMinutes: string
  tipAmount: null
  tipStatus: 'Not tracked'
}

export function createSessionAnalyticsCsv(rows: Array<SessionAnalyticsCsvRow>) {
  const header = [
    'Session',
    'Order number',
    'Placed at',
    'Customer',
    'Status',
    'Item',
    'Options',
    'Customer note',
    'Quantity',
    'Unit price',
    'Line total',
    'Order total',
    'Preparation minutes',
    'Tip amount',
    'Tip status',
  ]
  const body = rows.map((row) =>
    [
      row.sessionName,
      row.orderNumber,
      row.placedAt,
      row.customerName,
      row.status,
      row.itemName,
      row.options,
      row.specialInstructions,
      row.quantity,
      row.unitPrice,
      row.lineTotal,
      row.orderTotal,
      row.preparationMinutes,
      row.tipAmount,
      row.tipStatus,
    ]
      .map(csvCell)
      .join(','),
  )
  return [header.join(','), ...body].join('\n')
}
