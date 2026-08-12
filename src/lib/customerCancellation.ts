const CONFIRMED_PAYMENT_STATUSES = new Set([
  'NOT_REQUIRED',
  'PAID',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
])

export function canCustomerCancelOrder(input: {
  status?: string | null
  paymentStatus?: string | null
}) {
  return (
    input.status === 'PENDING' &&
    CONFIRMED_PAYMENT_STATUSES.has(input.paymentStatus ?? '')
  )
}
