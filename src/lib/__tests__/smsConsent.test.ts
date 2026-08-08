import {
  SMS_CONSENT_VERSION,
  SmsConsentValidationError,
  normalizeUsPhoneNumber,
  prepareSmsConsent,
} from '../smsConsent'

describe('normalizeUsPhoneNumber', () => {
  test.each([
    ['(415) 555-2671', '+14155552671'],
    ['415-555-2671', '+14155552671'],
    ['+1 415 555 2671', '+14155552671'],
    ['1.415.555.2671', '+14155552671'],
  ])('normalizes %s to E.164', (input, expected) => {
    expect(normalizeUsPhoneNumber(input)).toBe(expected)
  })

  test.each(['', '555-2671', '011-555-2671', '415-055-2671', 'call me'])(
    'rejects invalid number %s',
    (input) => {
      expect(normalizeUsPhoneNumber(input)).toBeNull()
    },
  )
})

describe('prepareSmsConsent', () => {
  const now = new Date('2026-08-08T12:00:00.000Z')

  it('returns an empty consent record when SMS is not requested', () => {
    expect(
      prepareSmsConsent({ customerPhone: null, smsOptIn: false, now }),
    ).toEqual({
      customerPhone: null,
      smsOptedInAt: null,
      smsConsentVersion: null,
    })
  })

  it('normalizes the phone number and records affirmative consent', () => {
    expect(
      prepareSmsConsent({
        customerPhone: '(415) 555-2671',
        smsOptIn: true,
        now,
      }),
    ).toEqual({
      customerPhone: '+14155552671',
      smsOptedInAt: now,
      smsConsentVersion: SMS_CONSENT_VERSION,
    })
  })

  test.each([
    [null, undefined],
    ['415-555-2671', false],
    [null, true],
    ['not a number', true],
  ])('rejects invalid consent combination %#', (customerPhone, smsOptIn) => {
    expect(() => prepareSmsConsent({ customerPhone, smsOptIn, now })).toThrow(
      SmsConsentValidationError,
    )
  })
})
