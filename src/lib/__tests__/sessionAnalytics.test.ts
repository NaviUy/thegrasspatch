import {
  buildSessionAnalyticsSummary,
  createSessionAnalyticsCsv,
} from '../sessionAnalytics'

describe('buildSessionAnalyticsSummary', () => {
  it('calculates session totals, preparation time, and product ranking', () => {
    const result = buildSessionAnalyticsSummary(
      [
        {
          id: 'order-1',
          status: 'READY',
          totalPriceCents: 1200,
          createdAt: new Date('2026-08-08T20:00:00.000Z'),
          completedAt: new Date('2026-08-08T20:10:00.000Z'),
        },
        {
          id: 'order-2',
          status: 'MAKING',
          totalPriceCents: 500,
          createdAt: new Date('2026-08-08T20:05:00.000Z'),
          completedAt: null,
        },
        {
          id: 'order-3',
          status: 'READY',
          totalPriceCents: 700,
          createdAt: new Date('2026-08-08T20:10:00.000Z'),
          completedAt: new Date('2026-08-08T20:30:00.000Z'),
        },
      ],
      [
        {
          menuItemId: 'tea',
          itemName: 'Green Tea',
          quantity: 2,
          unitPriceCents: 500,
        },
        {
          menuItemId: 'coffee',
          itemName: 'Coffee',
          quantity: 1,
          unitPriceCents: 700,
        },
        {
          menuItemId: 'tea',
          itemName: 'Green Tea',
          quantity: 1,
          unitPriceCents: 500,
        },
      ],
    )

    expect(result.summary).toEqual({
      orderCount: 3,
      itemCount: 4,
      revenueCents: 2400,
      completedOrderCount: 2,
      outstandingOrderCount: 1,
      averagePreparationSeconds: 900,
    })
    expect(result.popularProducts[0]).toEqual({
      menuItemId: 'tea',
      name: 'Green Tea',
      quantity: 3,
      revenueCents: 1500,
    })
    expect(result.cancellationCount).toBe(0)
  })

  it('excludes cancelled orders and their items from sales metrics', () => {
    const result = buildSessionAnalyticsSummary(
      [
        {
          id: 'kept',
          status: 'READY',
          totalPriceCents: 500,
          createdAt: new Date('2026-08-08T20:00:00.000Z'),
          completedAt: new Date('2026-08-08T20:05:00.000Z'),
        },
        {
          id: 'cancelled',
          status: 'CANCELLED',
          totalPriceCents: 900,
          createdAt: new Date('2026-08-08T20:01:00.000Z'),
          completedAt: null,
        },
      ],
      [
        {
          orderId: 'kept',
          menuItemId: 'tea',
          itemName: 'Tea',
          quantity: 1,
          unitPriceCents: 500,
        },
        {
          orderId: 'cancelled',
          menuItemId: 'coffee',
          itemName: 'Coffee',
          quantity: 2,
          unitPriceCents: 450,
        },
      ],
    )

    expect(result.summary.orderCount).toBe(1)
    expect(result.summary.itemCount).toBe(1)
    expect(result.summary.revenueCents).toBe(500)
    expect(result.cancellationCount).toBe(1)
    expect(result.popularProducts.map((product) => product.name)).toEqual([
      'Tea',
    ])
  })

  it('returns no average when no completed order has a completion time', () => {
    const result = buildSessionAnalyticsSummary([], [])
    expect(result.summary.averagePreparationSeconds).toBeNull()
    expect(result.popularProducts).toEqual([])
  })
})

describe('createSessionAnalyticsCsv', () => {
  it('escapes commas and quotes in exported customer data', () => {
    const csv = createSessionAnalyticsCsv([
      {
        sessionName: 'Friday, August 8',
        orderNumber: 12,
        placedAt: '2026-08-08T20:00:00.000Z',
        customerName: 'Ivan "Navi" Yu',
        status: 'READY',
        itemName: 'Green Tea',
        options: 'Milk: Oat',
        specialInstructions: 'Light ice',
        quantity: 1,
        unitPrice: '5.00',
        lineTotal: '5.00',
        orderTotal: '5.00',
        preparationMinutes: '10.0',
        tipAmount: null,
        tipStatus: 'Not tracked',
      },
    ])

    expect(csv).toContain('"Friday, August 8"')
    expect(csv).toContain('"Ivan ""Navi"" Yu"')
    expect(csv).toContain(',Not tracked')
  })
})
