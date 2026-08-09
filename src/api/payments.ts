import { and, eq, inArray, or, sql } from 'drizzle-orm'
import type { Request, Response } from 'express'
import type Stripe from 'stripe'
import { db, schema } from '@/db/client'
import {
  getAppBaseUrl,
  getStripeClient,
  getStripeWebhookSecret,
} from '@/lib/stripe'
import {
  calculateCancellationRefundRequest,
  calculateCorrectionRefundRequest,
} from '@/lib/paymentReconciliation'

const CHECKOUT_EXPIRATION_SECONDS = 30 * 60

type DbClient = typeof db | any

function stripeObjectId(value: string | { id: string } | null) {
  return typeof value === 'string' ? value : (value?.id ?? null)
}

function refundErrorMessage(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 2_000) : String(error)
}

function orderPageUrl(orderId: string, paymentResult: string) {
  const url = new URL(`/order/${orderId}`, `${getAppBaseUrl()}/`)
  url.searchParams.set('payment', paymentResult)
  return url.toString()
}

async function findCheckoutPayment(
  session: Stripe.Checkout.Session,
  client: any = db,
) {
  const paymentId = session.metadata?.paymentId
  const condition = paymentId
    ? or(
        eq(schema.orderPayments.id, paymentId),
        eq(schema.orderPayments.providerCheckoutSessionId, session.id),
      )
    : eq(schema.orderPayments.providerCheckoutSessionId, session.id)

  return (
    await client.select().from(schema.orderPayments).where(condition).limit(1)
  ).at(0)
}

export async function createStripeCheckoutSession(input: {
  orderId: string
  orderNumber: number
  paymentId: string
  foodAmountCents: number
  tipAmountCents: number
}) {
  const stripe = getStripeClient()
  const expiresAtUnix =
    Math.floor(Date.now() / 1000) + CHECKOUT_EXPIRATION_SECONDS
  const expiresAt = new Date(expiresAtUnix * 1000)
  let session: Stripe.Checkout.Session | null = null

  const lineItems: Array<Stripe.Checkout.SessionCreateParams.LineItem> = [
    {
      price_data: {
        currency: 'usd',
        product_data: {
          name: `The Grass Patch order #${input.orderNumber}`,
        },
        unit_amount: input.foodAmountCents,
      },
      quantity: 1,
    },
  ]
  if (input.tipAmountCents > 0) {
    lineItems.push({
      price_data: {
        currency: 'usd',
        product_data: { name: 'Tip' },
        unit_amount: input.tipAmountCents,
      },
      quantity: 1,
    })
  }

  try {
    session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        payment_method_types: ['card'],
        wallet_options: {
          link: { display: 'never' },
        },
        client_reference_id: input.orderId,
        line_items: lineItems,
        expires_at: expiresAtUnix,
        success_url: `${orderPageUrl(input.orderId, 'success')}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: orderPageUrl(input.orderId, 'cancelled'),
        submit_type: 'pay',
        metadata: {
          orderId: input.orderId,
          paymentId: input.paymentId,
          paymentKind: 'ORDER_CHECKOUT',
        },
        payment_intent_data: {
          description: `The Grass Patch order #${input.orderNumber}`,
          metadata: {
            orderId: input.orderId,
            paymentId: input.paymentId,
            paymentKind: 'ORDER_CHECKOUT',
          },
        },
      },
      { idempotencyKey: `order-checkout:${input.paymentId}` },
    )

    if (!session.url) throw new Error('Stripe did not return a checkout URL.')

    await db.transaction(async (trx) => {
      await trx
        .update(schema.orderPayments)
        .set({
          providerCheckoutSessionId: session!.id,
          expiresAt,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.orderPayments.id, input.paymentId),
            eq(schema.orderPayments.status, 'PENDING'),
          ),
        )
      await trx
        .update(schema.orders)
        .set({ paymentExpiresAt: expiresAt, updatedAt: new Date() })
        .where(
          and(
            eq(schema.orders.id, input.orderId),
            eq(schema.orders.paymentStatus, 'PENDING'),
          ),
        )
    })

    return { checkoutUrl: session.url, expiresAt }
  } catch (error) {
    if (session?.status === 'open') {
      await stripe.checkout.sessions.expire(session.id).catch(() => undefined)
    }
    throw error
  }
}

export async function markCheckoutSetupFailed(
  orderId: string,
  paymentId: string,
) {
  await db.transaction(async (trx) => {
    await trx
      .update(schema.orderPayments)
      .set({ status: 'FAILED', updatedAt: new Date() })
      .where(
        and(
          eq(schema.orderPayments.id, paymentId),
          eq(schema.orderPayments.status, 'PENDING'),
        ),
      )
    await trx
      .update(schema.orders)
      .set({
        status: 'CANCELLED',
        paymentStatus: 'FAILED',
        cancelledAt: new Date(),
        cancellationReason: 'Payment setup failed.',
        version: sql`${schema.orders.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.orders.id, orderId),
          eq(schema.orders.paymentStatus, 'PENDING'),
        ),
      )
  })
}

export async function processCompletedCheckoutSession(
  session: Stripe.Checkout.Session,
) {
  if (session.payment_status !== 'paid') return

  await db.transaction(async (trx) => {
    const payment = await findCheckoutPayment(session, trx)
    if (!payment || payment.kind !== 'ORDER_CHECKOUT') return

    await trx.execute(
      sql`select ${schema.orderPayments.id} from ${schema.orderPayments} where ${schema.orderPayments.id} = ${payment.id} for update`,
    )
    const lockedPayment = await findCheckoutPayment(session, trx)
    if (!lockedPayment || lockedPayment.status === 'SUCCEEDED') return

    if (
      session.amount_total !== lockedPayment.amountCents ||
      session.currency !== lockedPayment.currency
    ) {
      throw new Error(`Stripe amount mismatch for payment ${lockedPayment.id}.`)
    }

    const succeededAt = new Date()
    await trx
      .update(schema.orderPayments)
      .set({
        status: 'SUCCEEDED',
        providerCheckoutSessionId: session.id,
        providerPaymentIntentId: stripeObjectId(session.payment_intent),
        succeededAt,
        updatedAt: succeededAt,
      })
      .where(eq(schema.orderPayments.id, lockedPayment.id))

    await trx
      .update(schema.orders)
      .set({
        paymentStatus: 'PAID',
        paymentExpiresAt: null,
        paidAt: succeededAt,
        foodAmountPaidCents: lockedPayment.foodAmountCents,
        checkoutTipCents: lockedPayment.tipAmountCents,
        updatedAt: succeededAt,
      })
      .where(eq(schema.orders.id, lockedPayment.orderId))
  })
}

async function closePendingCheckout(
  session: Stripe.Checkout.Session,
  input: {
    paymentStatus: 'FAILED' | 'EXPIRED'
    reason: string
  },
) {
  await db.transaction(async (trx) => {
    const payment = await findCheckoutPayment(session, trx)
    if (!payment || payment.kind !== 'ORDER_CHECKOUT') return

    await trx.execute(
      sql`select ${schema.orderPayments.id} from ${schema.orderPayments} where ${schema.orderPayments.id} = ${payment.id} for update`,
    )
    const lockedPayment = await findCheckoutPayment(session, trx)
    if (!lockedPayment || lockedPayment.status !== 'PENDING') return

    await trx
      .update(schema.orderPayments)
      .set({
        status: input.paymentStatus,
        providerCheckoutSessionId: session.id,
        updatedAt: new Date(),
      })
      .where(eq(schema.orderPayments.id, lockedPayment.id))
    await trx
      .update(schema.orders)
      .set({
        status: 'CANCELLED',
        paymentStatus: input.paymentStatus,
        cancelledAt: new Date(),
        cancellationReason: input.reason,
        version: sql`${schema.orders.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.orders.id, lockedPayment.orderId),
          eq(schema.orders.paymentStatus, 'PENDING'),
        ),
      )
  })
}

export async function processExpiredCheckoutSession(
  session: Stripe.Checkout.Session,
  reason = 'Payment window expired.',
) {
  await closePendingCheckout(session, { paymentStatus: 'EXPIRED', reason })
}

async function recordPostOrderTip(session: Stripe.Checkout.Session) {
  if (
    session.payment_status !== 'paid' ||
    !session.payment_link ||
    !session.client_reference_id ||
    !session.amount_total ||
    session.amount_total <= 0
  ) {
    return
  }

  const orderId = session.client_reference_id
  await db.transaction(async (trx) => {
    const order = (
      await trx
        .select({ id: schema.orders.id })
        .from(schema.orders)
        .where(eq(schema.orders.id, orderId))
        .limit(1)
    ).at(0)
    if (!order) return

    const inserted = (
      await trx
        .insert(schema.orderPayments)
        .values({
          orderId,
          kind: 'POST_ORDER_TIP',
          status: 'SUCCEEDED',
          currency: session.currency ?? 'usd',
          amountCents: session.amount_total!,
          foodAmountCents: 0,
          tipAmountCents: session.amount_total!,
          providerCheckoutSessionId: session.id,
          providerPaymentIntentId: stripeObjectId(session.payment_intent),
          succeededAt: new Date(),
        })
        .onConflictDoNothing({
          target: schema.orderPayments.providerCheckoutSessionId,
        })
        .returning({ id: schema.orderPayments.id })
    ).at(0)
    if (!inserted) return

    await trx
      .update(schema.orders)
      .set({
        postOrderTipCents: sql`${schema.orders.postOrderTipCents} + ${session.amount_total!}`,
        updatedAt: new Date(),
      })
      .where(eq(schema.orders.id, orderId))
  })
}

async function getCheckoutPaymentForRefund(orderId: string, client: DbClient) {
  return (
    await client
      .select()
      .from(schema.orderPayments)
      .where(
        and(
          eq(schema.orderPayments.orderId, orderId),
          eq(schema.orderPayments.kind, 'ORDER_CHECKOUT'),
        ),
      )
      .limit(1)
  ).at(0)
}

function listPaymentRefunds(orderPaymentId: string, client: DbClient) {
  return client
    .select()
    .from(schema.paymentRefunds)
    .where(eq(schema.paymentRefunds.orderPaymentId, orderPaymentId))
}

async function insertRefundRequest(
  input: {
    orderPaymentId: string
    amountCents: number
    foodAmountCents: number
    tipAmountCents: number
    reason: string
    requestedByUserId: string
    idempotencyKey: string
  },
  client: DbClient,
) {
  const inserted = (
    await client
      .insert(schema.paymentRefunds)
      .values({
        ...input,
        status: 'PENDING',
      })
      .onConflictDoNothing({
        target: schema.paymentRefunds.idempotencyKey,
      })
      .returning({ id: schema.paymentRefunds.id })
  ).at(0)
  if (inserted) return inserted.id

  return (
    await client
      .select({ id: schema.paymentRefunds.id })
      .from(schema.paymentRefunds)
      .where(eq(schema.paymentRefunds.idempotencyKey, input.idempotencyKey))
      .limit(1)
  ).at(0)?.id
}

function retryableRefundIds(
  refunds: Array<{
    id: string
    status: string
    providerRefundId: string | null
  }>,
) {
  return refunds
    .filter(
      (refund) =>
        refund.status === 'PENDING' ||
        (refund.status === 'FAILED' && !refund.providerRefundId),
    )
    .map((refund) => refund.id)
}

export async function queueOrderCorrectionRefund(
  input: {
    orderId: string
    orderVersion: number
    newFoodAmountCents: number
    reason: string
    requestedByUserId: string
    idempotencyPrefix?: string
  },
  client: DbClient,
) {
  const payment = await getCheckoutPaymentForRefund(input.orderId, client)
  if (!payment || !payment.providerPaymentIntentId) return []
  if (
    !['SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(payment.status)
  ) {
    return []
  }

  const refunds = await listPaymentRefunds(payment.id, client)
  const foodAmountCents = calculateCorrectionRefundRequest({
    originalFoodAmountCents: payment.foodAmountCents,
    newFoodAmountCents: input.newFoodAmountCents,
    refunds,
  })
  const ids = retryableRefundIds(refunds)
  if (foodAmountCents === 0) return ids

  const id = await insertRefundRequest(
    {
      orderPaymentId: payment.id,
      amountCents: foodAmountCents,
      foodAmountCents,
      tipAmountCents: 0,
      reason: input.reason,
      requestedByUserId: input.requestedByUserId,
      idempotencyKey: `${input.idempotencyPrefix ?? 'order-correction'}:${input.orderId}:v${input.orderVersion}`,
    },
    client,
  )
  return id ? [...new Set([...ids, id])] : ids
}

export async function queueOrderCancellationRefund(
  input: {
    orderId: string
    orderVersion: number
    reason: string
    requestedByUserId: string
    idempotencyPrefix?: string
  },
  client: DbClient,
) {
  const payment = await getCheckoutPaymentForRefund(input.orderId, client)
  if (!payment || !payment.providerPaymentIntentId) return []
  if (
    !['SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(payment.status)
  ) {
    return []
  }

  const refunds = await listPaymentRefunds(payment.id, client)
  const { foodAmountCents, tipAmountCents, amountCents } =
    calculateCancellationRefundRequest({
      originalFoodAmountCents: payment.foodAmountCents,
      originalTipAmountCents: payment.tipAmountCents,
      refunds,
    })
  const ids = retryableRefundIds(refunds)
  if (amountCents === 0) return ids

  const id = await insertRefundRequest(
    {
      orderPaymentId: payment.id,
      amountCents,
      foodAmountCents,
      tipAmountCents,
      reason: input.reason,
      requestedByUserId: input.requestedByUserId,
      idempotencyKey: `${input.idempotencyPrefix ?? 'order-cancellation'}:${input.orderId}:v${input.orderVersion}`,
    },
    client,
  )
  return id ? [...new Set([...ids, id])] : ids
}

export async function reconcileStripeRefund(refund: Stripe.Refund) {
  const refundId = refund.metadata?.refundId
  const localRefund = (
    await db
      .select()
      .from(schema.paymentRefunds)
      .where(
        refundId
          ? or(
              eq(schema.paymentRefunds.id, refundId),
              eq(schema.paymentRefunds.providerRefundId, refund.id),
            )
          : eq(schema.paymentRefunds.providerRefundId, refund.id),
      )
      .limit(1)
  ).at(0)
  if (!localRefund) return

  await db.transaction(async (trx) => {
    await trx.execute(
      sql`select ${schema.paymentRefunds.id} from ${schema.paymentRefunds} where ${schema.paymentRefunds.id} = ${localRefund.id} for update`,
    )
    const lockedRefund = (
      await trx
        .select()
        .from(schema.paymentRefunds)
        .where(eq(schema.paymentRefunds.id, localRefund.id))
        .limit(1)
    ).at(0)
    if (!lockedRefund || lockedRefund.amountCents !== refund.amount) return
    // Stripe refund statuses are terminal once succeeded, failed, or canceled.
    // Ignore delayed webhook deliveries that would otherwise move a terminal
    // refund backward and apply or reverse its ledger amounts twice.
    if (
      lockedRefund.status === 'SUCCEEDED' ||
      lockedRefund.status === 'CANCELED' ||
      (lockedRefund.status === 'FAILED' && lockedRefund.providerRefundId)
    ) {
      return
    }

    const payment = (
      await trx
        .select()
        .from(schema.orderPayments)
        .where(eq(schema.orderPayments.id, lockedRefund.orderPaymentId))
        .limit(1)
    ).at(0)
    if (!payment) return

    const isApplied = refund.status === 'succeeded'
    const appliedDirection = isApplied ? 1 : 0
    const localStatus = isApplied
      ? 'SUCCEEDED'
      : refund.status === 'failed'
        ? 'FAILED'
        : refund.status === 'canceled'
          ? 'CANCELED'
          : 'PENDING'

    await trx
      .update(schema.paymentRefunds)
      .set({
        status: localStatus,
        providerRefundId: refund.id,
        lastError:
          refund.status === 'failed'
            ? (refund.failure_reason ?? 'Stripe refund failed.')
            : null,
        processedAt: isApplied ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(schema.paymentRefunds.id, lockedRefund.id))

    if (appliedDirection === 0) return

    const refundedAmountCents = Math.max(
      0,
      payment.refundedAmountCents + appliedDirection * lockedRefund.amountCents,
    )
    const paymentStatus =
      refundedAmountCents >= payment.amountCents
        ? 'REFUNDED'
        : refundedAmountCents > 0
          ? 'PARTIALLY_REFUNDED'
          : 'SUCCEEDED'
    const orderPaymentStatus =
      paymentStatus === 'SUCCEEDED' ? 'PAID' : paymentStatus

    await trx
      .update(schema.orderPayments)
      .set({
        refundedAmountCents,
        status: paymentStatus,
        updatedAt: new Date(),
      })
      .where(eq(schema.orderPayments.id, payment.id))
    await trx
      .update(schema.orders)
      .set({
        paymentStatus: orderPaymentStatus,
        foodAmountRefundedCents: sql`greatest(0, ${schema.orders.foodAmountRefundedCents} + ${appliedDirection * lockedRefund.foodAmountCents})`,
        tipAmountRefundedCents: sql`greatest(0, ${schema.orders.tipAmountRefundedCents} + ${appliedDirection * lockedRefund.tipAmountCents})`,
        updatedAt: new Date(),
      })
      .where(eq(schema.orders.id, payment.orderId))
  })
}

export async function processPaymentRefund(refundId: string) {
  const refundRequest = (
    await db
      .select({
        id: schema.paymentRefunds.id,
        status: schema.paymentRefunds.status,
        amountCents: schema.paymentRefunds.amountCents,
        reason: schema.paymentRefunds.reason,
        idempotencyKey: schema.paymentRefunds.idempotencyKey,
        providerRefundId: schema.paymentRefunds.providerRefundId,
        orderId: schema.orderPayments.orderId,
        paymentIntentId: schema.orderPayments.providerPaymentIntentId,
      })
      .from(schema.paymentRefunds)
      .innerJoin(
        schema.orderPayments,
        eq(schema.orderPayments.id, schema.paymentRefunds.orderPaymentId),
      )
      .where(eq(schema.paymentRefunds.id, refundId))
      .limit(1)
  ).at(0)
  if (!refundRequest || refundRequest.status === 'SUCCEEDED') return
  if (refundRequest.status === 'CANCELED') return
  if (!refundRequest.paymentIntentId) {
    await db
      .update(schema.paymentRefunds)
      .set({
        status: 'FAILED',
        lastError: 'Stripe PaymentIntent is missing.',
        updatedAt: new Date(),
      })
      .where(eq(schema.paymentRefunds.id, refundId))
    return
  }

  try {
    const stripe = getStripeClient()
    const refund = refundRequest.providerRefundId
      ? await stripe.refunds.retrieve(refundRequest.providerRefundId)
      : await stripe.refunds.create(
          {
            payment_intent: refundRequest.paymentIntentId,
            amount: refundRequest.amountCents,
            reason: 'requested_by_customer',
            metadata: {
              orderId: refundRequest.orderId,
              refundId: refundRequest.id,
            },
          },
          { idempotencyKey: refundRequest.idempotencyKey },
        )
    await reconcileStripeRefund(refund)
  } catch (error) {
    await db
      .update(schema.paymentRefunds)
      .set({
        status: 'FAILED',
        lastError: refundErrorMessage(error),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.paymentRefunds.id, refundId),
          eq(schema.paymentRefunds.status, 'PENDING'),
        ),
      )
  }
}

export async function processPaymentRefunds(refundIds: Array<string>) {
  await Promise.allSettled([...new Set(refundIds)].map(processPaymentRefund))
}

export async function retryOrderRefunds(input: {
  orderId: string
  requestedByUserId: string
}) {
  const existing = await db
    .select({ id: schema.paymentRefunds.id })
    .from(schema.paymentRefunds)
    .innerJoin(
      schema.orderPayments,
      eq(schema.orderPayments.id, schema.paymentRefunds.orderPaymentId),
    )
    .where(
      and(
        eq(schema.orderPayments.orderId, input.orderId),
        inArray(schema.paymentRefunds.status, ['PENDING', 'FAILED']),
      ),
    )
  await processPaymentRefunds(existing.map((refund) => refund.id))

  const queuedIds = await db.transaction(async (trx) => {
    await trx.execute(
      sql`select ${schema.orders.id} from ${schema.orders} where ${schema.orders.id} = ${input.orderId} for update`,
    )
    const order = (
      await trx
        .select({
          id: schema.orders.id,
          status: schema.orders.status,
          version: schema.orders.version,
          totalPriceCents: schema.orders.totalPriceCents,
        })
        .from(schema.orders)
        .where(eq(schema.orders.id, input.orderId))
        .limit(1)
    ).at(0)
    if (!order) throw new Error('Order not found.')

    const payment = await getCheckoutPaymentForRefund(order.id, trx)
    const attemptCount = payment
      ? (await listPaymentRefunds(payment.id, trx)).length
      : 0
    if (order.status === 'CANCELLED') {
      return queueOrderCancellationRefund(
        {
          orderId: order.id,
          orderVersion: order.version,
          reason: 'Retry automatic cancellation refund.',
          requestedByUserId: input.requestedByUserId,
          idempotencyPrefix: `refund-retry-${attemptCount + 1}`,
        },
        trx,
      )
    }
    return queueOrderCorrectionRefund(
      {
        orderId: order.id,
        orderVersion: order.version + attemptCount + 1,
        newFoodAmountCents: order.totalPriceCents,
        reason: 'Retry automatic order adjustment refund.',
        requestedByUserId: input.requestedByUserId,
        idempotencyPrefix: `refund-retry-correction-${attemptCount + 1}`,
      },
      trx,
    )
  })
  await processPaymentRefunds(queuedIds)
}

export async function handleStripeEvent(event: Stripe.Event) {
  if (
    event.type === 'checkout.session.completed' ||
    event.type === 'checkout.session.async_payment_succeeded'
  ) {
    const session = event.data.object
    if (session.metadata?.paymentKind === 'ORDER_CHECKOUT') {
      await processCompletedCheckoutSession(session)
    } else {
      await recordPostOrderTip(session)
    }
    return
  }

  if (event.type === 'checkout.session.expired') {
    await processExpiredCheckoutSession(event.data.object)
    return
  }

  if (event.type === 'checkout.session.async_payment_failed') {
    await closePendingCheckout(event.data.object, {
      paymentStatus: 'FAILED',
      reason: 'Payment failed.',
    })
    return
  }

  if (
    event.type === 'refund.created' ||
    event.type === 'refund.updated' ||
    event.type === 'refund.failed'
  ) {
    await reconcileStripeRefund(event.data.object)
  }
}

export async function stripeWebhookHandler(req: Request, res: Response) {
  const signature = req.header('stripe-signature')
  if (!signature) {
    return res.status(400).json({ error: 'Missing Stripe signature.' })
  }

  let event: Stripe.Event
  try {
    event = getStripeClient().webhooks.constructEvent(
      req.body,
      signature,
      getStripeWebhookSecret(),
    )
  } catch (error: any) {
    console.error('Stripe webhook signature error:', error?.message)
    return res.status(400).json({ error: 'Invalid Stripe signature.' })
  }

  try {
    await handleStripeEvent(event)
    return res.json({ received: true })
  } catch (error) {
    console.error('Stripe webhook processing error:', error)
    return res.status(500).json({ error: 'Failed to process Stripe event.' })
  }
}

export async function getPendingCheckoutSession(orderId: string) {
  const payment = (
    await db
      .select()
      .from(schema.orderPayments)
      .where(
        and(
          eq(schema.orderPayments.orderId, orderId),
          eq(schema.orderPayments.kind, 'ORDER_CHECKOUT'),
        ),
      )
      .limit(1)
  ).at(0)
  if (!payment) throw new Error('Payment session not found.')
  if (!payment.providerCheckoutSessionId) {
    return { paymentStatus: payment.status, checkoutUrl: null, expiresAt: null }
  }

  const stripe = getStripeClient()
  const session = await stripe.checkout.sessions.retrieve(
    payment.providerCheckoutSessionId,
  )
  if (session.status === 'complete') {
    await processCompletedCheckoutSession(session)
  } else if (session.status === 'expired') {
    await processExpiredCheckoutSession(session)
  }

  return {
    paymentStatus:
      session.status === 'complete'
        ? 'SUCCEEDED'
        : session.status === 'expired'
          ? 'EXPIRED'
          : payment.status,
    checkoutUrl: session.status === 'open' ? session.url : null,
    expiresAt: payment.expiresAt,
  }
}

export async function cancelPendingCheckout(orderId: string) {
  const payment = (
    await db
      .select()
      .from(schema.orderPayments)
      .where(
        and(
          eq(schema.orderPayments.orderId, orderId),
          eq(schema.orderPayments.kind, 'ORDER_CHECKOUT'),
        ),
      )
      .limit(1)
  ).at(0)
  if (!payment?.providerCheckoutSessionId) {
    throw new Error('Open payment session not found.')
  }

  const stripe = getStripeClient()
  let session = await stripe.checkout.sessions.retrieve(
    payment.providerCheckoutSessionId,
  )
  if (session.status === 'open') {
    session = await stripe.checkout.sessions.expire(session.id)
  }
  if (session.status === 'complete') {
    await processCompletedCheckoutSession(session)
    throw new Error('This order has already been paid.')
  }
  await processExpiredCheckoutSession(session, 'Customer cancelled payment.')
  return { paymentStatus: 'EXPIRED' as const }
}
