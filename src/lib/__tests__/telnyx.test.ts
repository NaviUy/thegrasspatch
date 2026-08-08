import { generateKeyPairSync, sign } from 'node:crypto'
import {
  getTelnyxSendingConfig,
  normalizeSmsKeyword,
  normalizeTelnyxMessageStatus,
  verifyTelnyxWebhook,
} from '../telnyx'

describe('getTelnyxSendingConfig', () => {
  it('keeps sending disabled unless explicitly enabled', () => {
    expect(getTelnyxSendingConfig({})).toBeNull()
    expect(
      getTelnyxSendingConfig({ TELNYX_MESSAGING_ENABLED: 'false' }),
    ).toBeNull()
  })

  it('returns valid enabled configuration', () => {
    expect(
      getTelnyxSendingConfig({
        TELNYX_MESSAGING_ENABLED: 'true',
        TELNYX_API_KEY: 'test-key',
        TELNYX_FROM_NUMBER: '+18335551234',
      }),
    ).toEqual({ apiKey: 'test-key', fromNumber: '+18335551234' })
  })

  it('rejects incomplete enabled configuration', () => {
    expect(() =>
      getTelnyxSendingConfig({ TELNYX_MESSAGING_ENABLED: 'true' }),
    ).toThrow('TELNYX_API_KEY')

    expect(() =>
      getTelnyxSendingConfig({
        TELNYX_MESSAGING_ENABLED: 'true',
        TELNYX_API_KEY: 'test-key',
        TELNYX_FROM_NUMBER: '833-555-1234',
      }),
    ).toThrow('TELNYX_FROM_NUMBER')
  })
})

describe('Telnyx message helpers', () => {
  it('normalizes provider statuses for storage', () => {
    expect(normalizeTelnyxMessageStatus('delivery_failed')).toBe(
      'DELIVERY_FAILED',
    )
    expect(normalizeTelnyxMessageStatus()).toBe('QUEUED')
  })

  it('normalizes inbound keywords', () => {
    expect(normalizeSmsKeyword('  help\n')).toBe('HELP')
  })
})

describe('verifyTelnyxWebhook', () => {
  const rawBody = JSON.stringify({
    data: { event_type: 'message.received', payload: { text: 'HELP' } },
  })

  function signedWebhook(body: string) {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519')
    const timestamp = String(Math.floor(Date.now() / 1000))
    const signature = sign(
      null,
      Buffer.from(`${timestamp}|${body}`),
      privateKey,
    ).toString('base64')
    const publicKeyDer = publicKey.export({ format: 'der', type: 'spki' })
    const telnyxPublicKey = publicKeyDer.subarray(-32).toString('base64')

    return {
      headers: {
        'telnyx-signature-ed25519': signature,
        'telnyx-timestamp': timestamp,
      },
      publicKey: telnyxPublicKey,
    }
  }

  it('accepts a correctly signed webhook', async () => {
    const signed = signedWebhook(rawBody)
    await expect(
      verifyTelnyxWebhook(rawBody, signed.headers, signed.publicKey),
    ).resolves.toEqual(JSON.parse(rawBody))
  })

  it('rejects a modified webhook body', async () => {
    const signed = signedWebhook(rawBody)
    await expect(
      verifyTelnyxWebhook(`${rawBody} `, signed.headers, signed.publicKey),
    ).rejects.toThrow('signature')
  })
})
