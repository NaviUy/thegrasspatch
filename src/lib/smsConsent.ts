export const SMS_CONSENT_VERSION = 'checkout-2026-08-08'

export class SmsConsentValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SmsConsentValidationError'
  }
}

export function normalizeUsPhoneNumber(value: string): string | null {
  const trimmedValue = value.trim()

  if (!trimmedValue || !/^[+\d\s().-]+$/.test(trimmedValue)) {
    return null
  }

  const digits = trimmedValue.replace(/\D/g, '')
  const nationalNumber =
    digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits

  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(nationalNumber)) {
    return null
  }

  return `+1${nationalNumber}`
}

export function prepareSmsConsent(input: {
  customerPhone: unknown
  smsOptIn: unknown
  now?: Date
}) {
  if (typeof input.smsOptIn !== 'boolean') {
    throw new SmsConsentValidationError(
      'SMS consent selection must be provided.',
    )
  }

  if (
    input.customerPhone !== null &&
    input.customerPhone !== undefined &&
    typeof input.customerPhone !== 'string'
  ) {
    throw new SmsConsentValidationError('Phone number must be a string.')
  }

  const rawPhone =
    typeof input.customerPhone === 'string' ? input.customerPhone.trim() : ''

  if (!rawPhone) {
    if (input.smsOptIn) {
      throw new SmsConsentValidationError(
        'A mobile phone number is required to receive SMS updates.',
      )
    }

    return {
      customerPhone: null,
      smsOptedInAt: null,
      smsConsentVersion: null,
    }
  }

  if (!input.smsOptIn) {
    throw new SmsConsentValidationError(
      'SMS consent is required when a phone number is provided.',
    )
  }

  const customerPhone = normalizeUsPhoneNumber(rawPhone)
  if (!customerPhone) {
    throw new SmsConsentValidationError('Enter a valid US mobile phone number.')
  }

  return {
    customerPhone,
    smsOptedInAt: input.now ?? new Date(),
    smsConsentVersion: SMS_CONSENT_VERSION,
  }
}
