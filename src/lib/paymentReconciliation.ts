export type RefundProgressStatus = 'NONE' | 'PENDING' | 'FAILED'

export type RefundAttemptSummary = {
  status: string
  amountCents: number
}

export type RefundAllocationAttempt = RefundAttemptSummary & {
  foodAmountCents: number
  tipAmountCents: number
  providerRefundId: string | null
}

export function reservesRefundAmount(refund: RefundAllocationAttempt) {
  return (
    refund.status === 'SUCCEEDED' ||
    refund.status === 'PENDING' ||
    (refund.status === 'FAILED' && !refund.providerRefundId)
  )
}

export function calculateCorrectionRefundRequest(input: {
  originalFoodAmountCents: number
  newFoodAmountCents: number
  refunds: Array<RefundAllocationAttempt>
}) {
  const reservedFoodRefundCents = input.refunds
    .filter(reservesRefundAmount)
    .reduce((sum, refund) => sum + refund.foodAmountCents, 0)
  const targetFoodRefundCents = Math.max(
    0,
    input.originalFoodAmountCents - input.newFoodAmountCents,
  )
  return Math.max(0, targetFoodRefundCents - reservedFoodRefundCents)
}

export function calculateCancellationRefundRequest(input: {
  originalFoodAmountCents: number
  originalTipAmountCents: number
  refunds: Array<RefundAllocationAttempt>
}) {
  const reserved = input.refunds.filter(reservesRefundAmount)
  const foodAmountCents = Math.max(
    0,
    input.originalFoodAmountCents -
      reserved.reduce((sum, refund) => sum + refund.foodAmountCents, 0),
  )
  const tipAmountCents = Math.max(
    0,
    input.originalTipAmountCents -
      reserved.reduce((sum, refund) => sum + refund.tipAmountCents, 0),
  )
  return {
    foodAmountCents,
    tipAmountCents,
    amountCents: foodAmountCents + tipAmountCents,
  }
}

export function calculatePaymentReconciliation(input: {
  orderStatus: string
  totalPriceCents: number
  foodAmountPaidCents: number
  checkoutTipCents: number
  foodAmountRefundedCents: number
  tipAmountRefundedCents: number
  refundAttempts?: Array<RefundAttemptSummary>
}) {
  const totalRefundedCents =
    input.foodAmountRefundedCents + input.tipAmountRefundedCents
  const netFoodPaidCents = Math.max(
    0,
    input.foodAmountPaidCents - input.foodAmountRefundedCents,
  )
  const refundableOnCancelCents = Math.max(
    0,
    input.foodAmountPaidCents + input.checkoutTipCents - totalRefundedCents,
  )
  const priceReductionRefundCents = Math.max(
    0,
    netFoodPaidCents - input.totalPriceCents,
  )
  const refundOutstandingCents =
    input.orderStatus === 'CANCELLED'
      ? refundableOnCancelCents
      : priceReductionRefundCents
  const paymentAmountDueCents =
    input.orderStatus === 'CANCELLED'
      ? 0
      : Math.max(0, input.totalPriceCents - netFoodPaidCents)

  const pendingRefundCents = (input.refundAttempts ?? [])
    .filter((attempt) => attempt.status === 'PENDING')
    .reduce((sum, attempt) => sum + attempt.amountCents, 0)
  const failedRefundCents = (input.refundAttempts ?? [])
    .filter((attempt) => attempt.status === 'FAILED')
    .reduce((sum, attempt) => sum + attempt.amountCents, 0)

  let refundProgressStatus: RefundProgressStatus = 'NONE'
  if (refundOutstandingCents > 0) {
    refundProgressStatus = pendingRefundCents > 0 ? 'PENDING' : 'FAILED'
  }

  return {
    netFoodPaidCents,
    totalRefundedCents,
    refundableOnCancelCents,
    priceReductionRefundCents,
    paymentAmountDueCents,
    refundOutstandingCents,
    refundPendingCents: Math.min(refundOutstandingCents, pendingRefundCents),
    refundFailedCents: Math.min(refundOutstandingCents, failedRefundCents),
    refundProgressStatus,
  }
}
