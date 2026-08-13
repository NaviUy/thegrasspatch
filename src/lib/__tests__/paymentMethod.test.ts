import {
  formatPaymentMethod,
  paymentMethodSummaryFromCharge,
} from '../paymentMethod'
import type Stripe from 'stripe'

describe('payment method display', () => {
  it('formats a standard card', () => {
    expect(formatPaymentMethod({ brand: 'visa', last4: '4242' })).toBe(
      'Visa •••• 4242',
    )
  })

  it('prefers the wallet name when a wallet was used', () => {
    expect(
      formatPaymentMethod({
        brand: 'mastercard',
        last4: '4444',
        wallet: 'apple_pay',
      }),
    ).toBe('Apple Pay •••• 4444')
  })

  it('does not render a method when the last four are unavailable', () => {
    expect(formatPaymentMethod({ brand: 'visa' })).toBeNull()
    expect(formatPaymentMethod({})).toBeNull()
  })

  it('extracts safe card and wallet details from a Stripe charge', () => {
    const charge = {
      payment_method_details: {
        card: {
          brand: 'mastercard',
          last4: '4444',
          wallet: { type: 'google_pay' },
        },
      },
    } as Stripe.Charge

    expect(paymentMethodSummaryFromCharge(charge)).toEqual({
      brand: 'mastercard',
      last4: '4444',
      wallet: 'google_pay',
    })
  })
})
