export const CHECKOUT_TIP_SELECTIONS = [
  'NONE',
  'PERCENT_15',
  'PERCENT_20',
  'PERCENT_25',
  'CUSTOM',
] as const

export type CheckoutTipSelection = (typeof CHECKOUT_TIP_SELECTIONS)[number]

const MAX_CUSTOM_TIP_CENTS = 50_000

export class CheckoutTipValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CheckoutTipValidationError'
  }
}

export function calculateCheckoutTipCents(input: {
  foodAmountCents: number
  selection?: string | null
  customTipCents?: number | null
}) {
  if (!Number.isInteger(input.foodAmountCents) || input.foodAmountCents < 0) {
    throw new CheckoutTipValidationError('The order total is invalid.')
  }

  // Prepaid catering orders bypass Stripe and can only be tipped afterward.
  if (input.foodAmountCents === 0) return 0

  const selection = input.selection ?? 'NONE'
  if (!CHECKOUT_TIP_SELECTIONS.includes(selection as CheckoutTipSelection)) {
    throw new CheckoutTipValidationError('Select a valid tip option.')
  }

  if (selection === 'NONE') return 0
  if (selection === 'PERCENT_15') {
    return Math.round(input.foodAmountCents * 0.15)
  }
  if (selection === 'PERCENT_20') {
    return Math.round(input.foodAmountCents * 0.2)
  }
  if (selection === 'PERCENT_25') {
    return Math.round(input.foodAmountCents * 0.25)
  }

  const customTipCents = Number(input.customTipCents)
  if (
    !Number.isInteger(customTipCents) ||
    customTipCents < 0 ||
    customTipCents > MAX_CUSTOM_TIP_CENTS
  ) {
    throw new CheckoutTipValidationError(
      'Custom tips must be between $0 and $500.',
    )
  }
  return customTipCents
}
