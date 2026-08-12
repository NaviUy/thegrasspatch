import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/db/client'
import {
  HELP_SMS_MESSAGE,
  buildOrderCancelledSmsMessage,
  buildOrderCreatedSmsMessage,
  buildOrderReadySmsMessage,
  getTelnyxSendingConfig,
  normalizeTelnyxMessageStatus,
  sendTelnyxSms,
} from '@/lib/telnyx'
import { getAppBaseUrl } from '@/lib/stripe'

type SmsSendOutcome =
  | { outcome: 'sent'; providerMessageId: string }
  | { outcome: 'skipped'; reason: string }
  | { outcome: 'failed'; reason: string }

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown SMS error.'
}

async function updateEventAfterSend(
  eventId: string,
  result: { providerMessageId: string; status: string },
) {
  await db
    .update(schema.smsEvents)
    .set({
      providerMessageId: result.providerMessageId,
      status: result.status,
      errorMessage: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.smsEvents.id, eventId))
}

async function markEventFailed(eventId: string, error: unknown) {
  await db
    .update(schema.smsEvents)
    .set({
      status: 'FAILED',
      errorMessage: errorMessage(error),
      updatedAt: new Date(),
    })
    .where(eq(schema.smsEvents.id, eventId))
}

type OrderSmsType = 'ORDER_CREATED' | 'ORDER_READY' | 'ORDER_CANCELLED'

async function sendOrderNotification(
  orderId: string,
  type: OrderSmsType,
  buildMessage: (order: { id: string; orderNumber: number }) => string,
): Promise<SmsSendOutcome> {
  let config
  try {
    config = getTelnyxSendingConfig()
  } catch (error) {
    return { outcome: 'failed', reason: errorMessage(error) }
  }

  if (!config) {
    return { outcome: 'skipped', reason: 'Telnyx messaging is disabled.' }
  }

  const matchingOrders = await db
    .select({
      id: schema.orders.id,
      orderNumber: schema.orders.orderNumber,
      customerPhone: schema.orders.customerPhone,
      smsOptedInAt: schema.orders.smsOptedInAt,
      smsConsentVersion: schema.orders.smsConsentVersion,
    })
    .from(schema.orders)
    .where(eq(schema.orders.id, orderId))
    .limit(1)
  const order = matchingOrders.at(0)

  if (!order) {
    return { outcome: 'skipped', reason: 'Order not found.' }
  }

  if (!order.customerPhone || !order.smsOptedInAt || !order.smsConsentVersion) {
    return { outcome: 'skipped', reason: 'Order does not have SMS consent.' }
  }

  let message
  try {
    message = buildMessage(order)
  } catch (error) {
    return { outcome: 'failed', reason: errorMessage(error) }
  }

  const insertedEvents = await db
    .insert(schema.smsEvents)
    .values({
      orderId: order.id,
      phone: order.customerPhone,
      type,
      message,
      status: 'SENDING',
    })
    .onConflictDoNothing({
      target: [schema.smsEvents.orderId, schema.smsEvents.type],
    })
    .returning()
  let event = insertedEvents.at(0)

  if (!event) {
    const retryEvents = await db
      .update(schema.smsEvents)
      .set({
        status: 'SENDING',
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.smsEvents.orderId, order.id),
          eq(schema.smsEvents.type, type),
          eq(schema.smsEvents.status, 'FAILED'),
        ),
      )
      .returning()
    event = retryEvents.at(0)
  }

  if (!event) {
    return { outcome: 'skipped', reason: `${type} SMS already processed.` }
  }

  try {
    const result = await sendTelnyxSms(
      { to: order.customerPhone, text: message },
      config,
    )
    await updateEventAfterSend(event.id, result)
    return { outcome: 'sent', providerMessageId: result.providerMessageId }
  } catch (error) {
    await markEventFailed(event.id, error)
    return { outcome: 'failed', reason: errorMessage(error) }
  }
}

export function sendOrderCreatedNotification(orderId: string) {
  return sendOrderNotification(orderId, 'ORDER_CREATED', (order) => {
    const trackingUrl = new URL(
      `/order/${order.id}`,
      `${getAppBaseUrl()}/`,
    ).toString()
    return buildOrderCreatedSmsMessage({
      orderNumber: order.orderNumber,
      trackingUrl,
    })
  })
}

export function sendOrderReadyNotification(orderId: string) {
  return sendOrderNotification(orderId, 'ORDER_READY', (order) =>
    buildOrderReadySmsMessage(order.orderNumber),
  )
}

export function sendOrderCancellationNotification(orderId: string) {
  return sendOrderNotification(orderId, 'ORDER_CANCELLED', (order) =>
    buildOrderCancelledSmsMessage(order.orderNumber),
  )
}

export async function respondToHelpKeyword(input: {
  sourceMessageId: string
  customerPhone: string
}) {
  const config = getTelnyxSendingConfig()
  if (!config) return

  const insertedEvents = await db
    .insert(schema.smsEvents)
    .values({
      sourceMessageId: input.sourceMessageId,
      phone: input.customerPhone,
      type: 'HELP_RESPONSE',
      message: HELP_SMS_MESSAGE,
      status: 'SENDING',
    })
    .onConflictDoNothing({ target: schema.smsEvents.sourceMessageId })
    .returning()
  let event = insertedEvents.at(0)

  if (!event) {
    const retryEvents = await db
      .update(schema.smsEvents)
      .set({
        status: 'SENDING',
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.smsEvents.sourceMessageId, input.sourceMessageId),
          eq(schema.smsEvents.status, 'FAILED'),
        ),
      )
      .returning()
    event = retryEvents.at(0)
  }

  if (!event) return

  try {
    const result = await sendTelnyxSms(
      { to: input.customerPhone, text: HELP_SMS_MESSAGE },
      config,
    )
    await updateEventAfterSend(event.id, result)
  } catch (error) {
    await markEventFailed(event.id, error)
    throw error
  }
}

export async function updateSmsDeliveryStatus(input: {
  providerMessageId: string
  status?: string
  errors?: Array<unknown>
}) {
  const providerStatus = normalizeTelnyxMessageStatus(input.status)
  const providerErrors = input.errors?.length
    ? JSON.stringify(input.errors)
    : null

  await db
    .update(schema.smsEvents)
    .set({
      status: providerStatus,
      errorMessage: providerErrors,
      updatedAt: new Date(),
    })
    .where(eq(schema.smsEvents.providerMessageId, input.providerMessageId))
}
