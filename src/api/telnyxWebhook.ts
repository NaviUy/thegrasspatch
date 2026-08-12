import { respondToHelpKeyword, updateSmsDeliveryStatus } from './sms'
import type { TelnyxWebhookEvent } from '@/lib/telnyx'
import { normalizeSmsKeyword } from '@/lib/telnyx'

export async function processTelnyxWebhook(event: TelnyxWebhookEvent) {
  const eventType = event.data?.event_type
  const payload = event.data?.payload

  if (!payload) return

  if (eventType === 'message.sent' || eventType === 'message.finalized') {
    if (!payload.id) return

    await updateSmsDeliveryStatus({
      providerMessageId: payload.id,
      status: payload.to?.[0]?.status,
      errors: payload.errors,
    })
    return
  }

  if (eventType !== 'message.received') return
  if (normalizeSmsKeyword(payload.text) !== 'HELP') return

  const customerPhone = payload.from?.phone_number
  if (!payload.id || !customerPhone) return

  await respondToHelpKeyword({
    sourceMessageId: payload.id,
    customerPhone,
  })
}
