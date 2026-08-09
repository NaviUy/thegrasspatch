import Stripe from 'stripe'

let stripeClient: Stripe | null = null

export function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim()
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY is not configured.')
  }
  if (!stripeClient) stripeClient = new Stripe(secretKey)
  return stripeClient
}

export function getStripeWebhookSecret() {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim()
  if (!secret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not configured.')
  }
  return secret
}

export function getAppBaseUrl() {
  const configured = process.env.APP_BASE_URL?.trim()
  if (!configured) throw new Error('APP_BASE_URL is not configured.')

  const url = new URL(configured)
  return url.toString().replace(/\/$/, '')
}
