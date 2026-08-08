import {
  getAvailableCartQuantity,
  getInventoryAvailability,
} from '../inventory'

describe('getInventoryAvailability', () => {
  it('treats a null limit as unlimited', () => {
    expect(
      getInventoryAvailability({
        inventoryLimit: null,
        quantitySold: 100,
        manuallySoldOut: false,
      }),
    ).toEqual({
      remainingQuantity: null,
      isSoldOut: false,
      isLimitedAvailability: false,
    })
  })

  it('marks five or fewer remaining items as limited availability', () => {
    expect(
      getInventoryAvailability({
        inventoryLimit: 20,
        quantitySold: 15,
        manuallySoldOut: false,
      }),
    ).toEqual({
      remainingQuantity: 5,
      isSoldOut: false,
      isLimitedAvailability: true,
    })
  })

  it('automatically marks an item sold out at zero remaining', () => {
    expect(
      getInventoryAvailability({
        inventoryLimit: 10,
        quantitySold: 10,
        manuallySoldOut: false,
      }),
    ).toEqual({
      remainingQuantity: 0,
      isSoldOut: true,
      isLimitedAvailability: false,
    })
  })

  it('honors the manual sold-out override for unlimited inventory', () => {
    expect(
      getInventoryAvailability({
        inventoryLimit: null,
        quantitySold: 0,
        manuallySoldOut: true,
      }).isSoldOut,
    ).toBe(true)
  })
})

describe('getAvailableCartQuantity', () => {
  it('does not reduce an unlimited item', () => {
    expect(
      getAvailableCartQuantity(12, {
        remainingQuantity: null,
        isSoldOut: false,
      }),
    ).toBe(12)
  })

  it('reduces a request to the remaining inventory', () => {
    expect(
      getAvailableCartQuantity(7, {
        remainingQuantity: 3,
        isSoldOut: false,
      }),
    ).toBe(3)
  })

  it('removes a sold-out item', () => {
    expect(
      getAvailableCartQuantity(2, {
        remainingQuantity: 10,
        isSoldOut: true,
      }),
    ).toBe(0)
  })
})
