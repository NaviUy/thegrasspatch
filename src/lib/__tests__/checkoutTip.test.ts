import {
  CheckoutTipValidationError,
  calculateCheckoutTipCents,
} from '../checkoutTip'

describe('calculateCheckoutTipCents', () => {
  test.each([
    ['NONE', 0],
    ['PERCENT_15', 150],
    ['PERCENT_20', 200],
    ['PERCENT_25', 250],
  ])('calculates %s from the server food total', (selection, expected) => {
    expect(
      calculateCheckoutTipCents({ foodAmountCents: 1000, selection }),
    ).toBe(expected)
  })

  it('rounds percentage tips to the nearest cent', () => {
    expect(
      calculateCheckoutTipCents({
        foodAmountCents: 999,
        selection: 'PERCENT_15',
      }),
    ).toBe(150)
  })

  it('accepts a custom tip within the limit', () => {
    expect(
      calculateCheckoutTipCents({
        foodAmountCents: 1000,
        selection: 'CUSTOM',
        customTipCents: 123,
      }),
    ).toBe(123)
  })

  it('ignores checkout tips for zero-dollar prepaid orders', () => {
    expect(
      calculateCheckoutTipCents({
        foodAmountCents: 0,
        selection: 'CUSTOM',
        customTipCents: 500,
      }),
    ).toBe(0)
  })

  it('rejects invalid selections and custom amounts', () => {
    expect(() =>
      calculateCheckoutTipCents({
        foodAmountCents: 1000,
        selection: 'PERCENT_50',
      }),
    ).toThrow(CheckoutTipValidationError)
    expect(() =>
      calculateCheckoutTipCents({
        foodAmountCents: 1000,
        selection: 'CUSTOM',
        customTipCents: 50_001,
      }),
    ).toThrow('Custom tips must be between $0 and $500.')
  })
})
