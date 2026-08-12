import { canCustomerCancelOrder } from '../customerCancellation'

describe('customer self-cancellation eligibility', () => {
  it.each(['NOT_REQUIRED', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'])(
    'allows a pending order with %s payment status',
    (paymentStatus) => {
      expect(canCustomerCancelOrder({ status: 'PENDING', paymentStatus })).toBe(
        true,
      )
    },
  )

  it.each(['MAKING', 'READY', 'CANCELLED'])(
    'does not allow an order in %s status',
    (status) => {
      expect(canCustomerCancelOrder({ status, paymentStatus: 'PAID' })).toBe(
        false,
      )
    },
  )

  it.each(['PENDING', 'FAILED', 'EXPIRED'])(
    'does not allow an unconfirmed order with %s payment status',
    (paymentStatus) => {
      expect(canCustomerCancelOrder({ status: 'PENDING', paymentStatus })).toBe(
        false,
      )
    },
  )
})
