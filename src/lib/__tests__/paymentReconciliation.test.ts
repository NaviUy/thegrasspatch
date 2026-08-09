import {
  calculateCancellationRefundRequest,
  calculateCorrectionRefundRequest,
  calculatePaymentReconciliation,
} from '../paymentReconciliation'

describe('calculatePaymentReconciliation', () => {
  it('calculates a price reduction refund without refunding the tip', () => {
    expect(
      calculatePaymentReconciliation({
        orderStatus: 'MAKING',
        totalPriceCents: 800,
        foodAmountPaidCents: 1_000,
        checkoutTipCents: 200,
        foodAmountRefundedCents: 0,
        tipAmountRefundedCents: 0,
        refundAttempts: [{ status: 'PENDING', amountCents: 200 }],
      }),
    ).toMatchObject({
      priceReductionRefundCents: 200,
      paymentAmountDueCents: 0,
      refundOutstandingCents: 200,
      refundProgressStatus: 'PENDING',
    })
  })

  it('leaves price increases for staff reconciliation', () => {
    expect(
      calculatePaymentReconciliation({
        orderStatus: 'PENDING',
        totalPriceCents: 1_250,
        foodAmountPaidCents: 1_000,
        checkoutTipCents: 150,
        foodAmountRefundedCents: 0,
        tipAmountRefundedCents: 0,
      }),
    ).toMatchObject({
      priceReductionRefundCents: 0,
      paymentAmountDueCents: 250,
      refundProgressStatus: 'NONE',
    })
  })

  it('refunds the remaining food and checkout tip on cancellation', () => {
    expect(
      calculatePaymentReconciliation({
        orderStatus: 'CANCELLED',
        totalPriceCents: 800,
        foodAmountPaidCents: 1_000,
        checkoutTipCents: 200,
        foodAmountRefundedCents: 200,
        tipAmountRefundedCents: 0,
        refundAttempts: [{ status: 'FAILED', amountCents: 1_000 }],
      }),
    ).toMatchObject({
      refundableOnCancelCents: 1_000,
      paymentAmountDueCents: 0,
      refundOutstandingCents: 1_000,
      refundProgressStatus: 'FAILED',
    })
  })

  it('does not show an old failed attempt after the required refund succeeds', () => {
    expect(
      calculatePaymentReconciliation({
        orderStatus: 'CANCELLED',
        totalPriceCents: 800,
        foodAmountPaidCents: 800,
        checkoutTipCents: 100,
        foodAmountRefundedCents: 800,
        tipAmountRefundedCents: 100,
        refundAttempts: [{ status: 'FAILED', amountCents: 900 }],
      }).refundProgressStatus,
    ).toBe('NONE')
  })
})

describe('refund request allocation', () => {
  const succeededFoodRefund = {
    status: 'SUCCEEDED',
    amountCents: 200,
    foodAmountCents: 200,
    tipAmountCents: 0,
    providerRefundId: 're_succeeded',
  }

  it('only queues the unreserved part of a correction refund', () => {
    expect(
      calculateCorrectionRefundRequest({
        originalFoodAmountCents: 1_000,
        newFoodAmountCents: 700,
        refunds: [succeededFoodRefund],
      }),
    ).toBe(100)
  })

  it('reserves ambiguous network failures to prevent duplicate refunds', () => {
    expect(
      calculateCorrectionRefundRequest({
        originalFoodAmountCents: 1_000,
        newFoodAmountCents: 800,
        refunds: [
          {
            status: 'FAILED',
            amountCents: 200,
            foodAmountCents: 200,
            tipAmountCents: 0,
            providerRefundId: null,
          },
        ],
      }),
    ).toBe(0)
  })

  it('does not reserve a refund Stripe definitively failed', () => {
    expect(
      calculateCorrectionRefundRequest({
        originalFoodAmountCents: 1_000,
        newFoodAmountCents: 800,
        refunds: [
          {
            status: 'FAILED',
            amountCents: 200,
            foodAmountCents: 200,
            tipAmountCents: 0,
            providerRefundId: 're_failed',
          },
        ],
      }),
    ).toBe(200)
  })

  it('allocates a cancellation refund across remaining food and tip', () => {
    expect(
      calculateCancellationRefundRequest({
        originalFoodAmountCents: 1_000,
        originalTipAmountCents: 200,
        refunds: [succeededFoodRefund],
      }),
    ).toEqual({
      foodAmountCents: 800,
      tipAmountCents: 200,
      amountCents: 1_000,
    })
  })
})
