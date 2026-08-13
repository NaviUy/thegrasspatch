import type Stripe from 'stripe'

export type PaymentMethodSummary = {
  brand?: string | null
  last4?: string | null
  wallet?: string | null
}

const PAYMENT_LABELS: Record<string, string> = {
  amex: 'American Express',
  apple_pay: 'Apple Pay',
  diners: 'Diners Club',
  discover: 'Discover',
  google_pay: 'Google Pay',
  jcb: 'JCB',
  link: 'Link',
  mastercard: 'Mastercard',
  unionpay: 'UnionPay',
  visa: 'Visa',
}

function paymentLabel(value?: string | null) {
  if (!value) return null
  return (
    PAYMENT_LABELS[value.toLowerCase()] ??
    value
      .split('_')
      .filter(Boolean)
      .map((part) => part[0].toUpperCase() + part.slice(1).toLowerCase())
      .join(' ')
  )
}

export function paymentMethodSummaryFromCharge(
  charge: Stripe.Charge,
): PaymentMethodSummary {
  const card = charge.payment_method_details?.card
  return {
    brand: card?.brand ?? null,
    last4: card?.last4 ?? null,
    wallet: card?.wallet?.type ?? null,
  }
}

export function formatPaymentMethod(summary: PaymentMethodSummary) {
  if (!summary.last4) return null
  const label = paymentLabel(summary.wallet) ?? paymentLabel(summary.brand)
  return label ? `${label} •••• ${summary.last4}` : `•••• ${summary.last4}`
}
