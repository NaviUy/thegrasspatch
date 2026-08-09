import { calculateWaitEstimate, formatWaitEstimate } from '../waitEstimate'

describe('calculateWaitEstimate', () => {
  it('places the fourth order in a 40–45 minute range at an 11 minute average', () => {
    expect(
      calculateWaitEstimate({
        mode: 'AUTO',
        manualMinMinutes: null,
        manualMaxMinutes: null,
        parallelCapacity: 1,
        averagePreparationSeconds: 11 * 60,
        ordersAhead: 3,
      }),
    ).toEqual({ minMinutes: 40, maxMinutes: 45, source: 'AUTO' })
  })

  it('accounts for orders prepared in parallel', () => {
    expect(
      calculateWaitEstimate({
        mode: 'AUTO',
        manualMinMinutes: null,
        manualMaxMinutes: null,
        parallelCapacity: 2,
        averagePreparationSeconds: 11 * 60,
        ordersAhead: 3,
      }),
    ).toEqual({ minMinutes: 20, maxMinutes: 25, source: 'AUTO' })
  })

  it('uses a ten-minute fallback without preparation history', () => {
    expect(
      calculateWaitEstimate({
        mode: 'AUTO',
        manualMinMinutes: null,
        manualMaxMinutes: null,
        parallelCapacity: 1,
        averagePreparationSeconds: null,
        ordersAhead: 0,
      }),
    ).toEqual({ minMinutes: 10, maxMinutes: 15, source: 'AUTO' })
  })

  it('honors manual and hidden modes', () => {
    expect(
      calculateWaitEstimate({
        mode: 'MANUAL',
        manualMinMinutes: 25,
        manualMaxMinutes: 35,
        parallelCapacity: 1,
        averagePreparationSeconds: 60,
        ordersAhead: 20,
      }),
    ).toEqual({ minMinutes: 25, maxMinutes: 35, source: 'MANUAL' })
    expect(
      calculateWaitEstimate({
        mode: 'HIDDEN',
        manualMinMinutes: null,
        manualMaxMinutes: null,
        parallelCapacity: 1,
        averagePreparationSeconds: 60,
        ordersAhead: 20,
      }),
    ).toEqual({ minMinutes: null, maxMinutes: null, source: null })
  })
})

describe('formatWaitEstimate', () => {
  it('formats visible ranges and ignores hidden estimates', () => {
    expect(formatWaitEstimate({ minMinutes: 40, maxMinutes: 45 })).toBe(
      '40–45 minutes',
    )
    expect(
      formatWaitEstimate({ minMinutes: null, maxMinutes: null }),
    ).toBeNull()
  })
})
