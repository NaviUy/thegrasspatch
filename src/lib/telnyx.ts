import Telnyx from 'telnyx'
import { TelnyxWebhook } from 'telnyx/lib/webhooks'

const SMS_COMPLIANCE_FOOTER = 'Reply STOP to opt out, HELP for help.'

export function buildOrderCreatedSmsMessage(input: {
  orderNumber: number
  trackingUrl: string
}) {
  return `The Grass Patch: Order #${input.orderNumber} confirmed. Track: ${input.trackingUrl} ${SMS_COMPLIANCE_FOOTER}`
}

export function buildOrderReadySmsMessage(orderNumber: number) {
  return `The Grass Patch: Order #${orderNumber} is ready for pickup. ${SMS_COMPLIANCE_FOOTER}`
}

export function buildOrderCancelledSmsMessage(orderNumber: number) {
  return `The Grass Patch: Order #${orderNumber} has been cancelled. Questions? Email hello@thegrasspatch.cafe. ${SMS_COMPLIANCE_FOOTER}`
}

export const HELP_SMS_MESSAGE =
  'The Grass Patch order updates: Help at hello@thegrasspatch.cafe. Msg & data rates may apply. Reply STOP to opt out.'

export type TelnyxSendingConfig = {
  apiKey: string
  fromNumber: string
}

export type TelnyxWebhookEvent = {
  data?: {
    id?: string
    event_type?: string
    payload?: {
      id?: string
      text?: string
      from?: { phone_number?: string }
      to?: Array<{ phone_number?: string; status?: string }>
      errors?: Array<unknown>
    }
  }
}

const E164_PATTERN = /^\+[1-9]\d{7,14}$/

export function getTelnyxSendingConfig(
  env: Record<string, string | undefined> = process.env,
): TelnyxSendingConfig | null {
  if (env.TELNYX_MESSAGING_ENABLED?.toLowerCase() !== 'true') {
    return null
  }

  const apiKey = env.TELNYX_API_KEY?.trim()
  const fromNumber = env.TELNYX_FROM_NUMBER?.trim()

  if (!apiKey) {
    throw new Error(
      'TELNYX_API_KEY is required when Telnyx messaging is enabled.',
    )
  }

  if (!fromNumber || !E164_PATTERN.test(fromNumber)) {
    throw new Error(
      'TELNYX_FROM_NUMBER must be a valid E.164 number when Telnyx messaging is enabled.',
    )
  }

  return { apiKey, fromNumber }
}

export function normalizeTelnyxMessageStatus(status?: string) {
  if (!status) return 'QUEUED'

  const normalized = status
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
  return normalized.slice(0, 20) || 'UNKNOWN'
}

export function normalizeSmsKeyword(text?: string) {
  return text?.trim().toUpperCase() ?? ''
}

export async function sendTelnyxSms(
  input: { to: string; text: string },
  config: TelnyxSendingConfig,
) {
  if (!E164_PATTERN.test(input.to)) {
    throw new Error('SMS destination must be a valid E.164 number.')
  }

  const client = new Telnyx({ apiKey: config.apiKey })
  const response = await client.messages.send({
    from: config.fromNumber,
    to: input.to,
    text: input.text,
    type: 'SMS',
    use_profile_webhooks: true,
  })

  const providerMessageId = response.data?.id
  if (!providerMessageId) {
    throw new Error(
      'Telnyx accepted the request without returning a message ID.',
    )
  }

  return {
    providerMessageId,
    status: normalizeTelnyxMessageStatus(response.data?.to?.[0]?.status),
  }
}

export async function verifyTelnyxWebhook(
  rawBody: string,
  headers: Record<string, string>,
  publicKey = process.env.TELNYX_PUBLIC_KEY,
) {
  if (!publicKey) {
    throw new Error('TELNYX_PUBLIC_KEY is not configured.')
  }

  const verifier = new TelnyxWebhook(publicKey)
  await verifier.verify(rawBody, headers)
  return JSON.parse(rawBody) as TelnyxWebhookEvent
}
