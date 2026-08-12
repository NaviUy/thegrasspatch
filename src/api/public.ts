import express from 'express'

import {
  getActiveMenuItems,
  getActiveSession,
  refreshCartItems,
} from './menuItem'
import {
  CustomerCancellationUnavailableError,
  OrderAvailabilityError,
  OrderConflictError,
  OrderTrackingAuthorizationError,
  cancelPublicOrder,
  createPublicOrder,
  getPublicOrder,
} from './order'
import { cancelPendingCheckout, getPendingCheckoutSession } from './payments'
import { getSessionWaitEstimate } from './waitEstimate'
import { SmsConsentValidationError, prepareSmsConsent } from '@/lib/smsConsent'
import { CheckoutTipValidationError } from '@/lib/checkoutTip'

export const publicRouter = express.Router()

// Get /api/public/active-session
publicRouter.get('/active-session', async (_req, res) => {
  try {
    const session = await getActiveSession()
    const estimatedWait = await getSessionWaitEstimate(session.id)
    res.json({ open: true, session: { ...session, estimatedWait } })
  } catch (error: any) {
    console.error('List menu error: ', error)
    res.status(500).json({ error: 'Failed to fetch active session.' })
  }
})

// Get /api/public/menu-items
publicRouter.get('/menu-items', async (_req, res) => {
  try {
    const session = await getActiveSession()
    const estimatedWait = await getSessionWaitEstimate(session.id)
    const items = await getActiveMenuItems()
    res.set('Cache-Control', 'no-store')
    return res.json({ session: { ...session, estimatedWait }, items })
  } catch (error: any) {
    console.error(error)
    return res.status(500).json({ error: 'Failed to load menu items.' })
  }
})

// POST /api/public/cart/refresh
publicRouter.post('/cart/refresh', async (req, res) => {
  const { items } = req.body ?? {}

  if (!Array.isArray(items)) {
    return res.status(400).json({ error: 'Items must be an array.' })
  }

  const normalized = items
    .map((item: any) => ({
      cartLineId:
        item && typeof item.cartLineId === 'string'
          ? item.cartLineId
          : item?.menuItemId,
      menuItemId:
        item && typeof item.menuItemId === 'string' ? item.menuItemId : null,
      quantity:
        item && typeof item.quantity === 'number'
          ? Math.floor(item.quantity)
          : Number.NaN,
      name: item && typeof item.name === 'string' ? item.name : undefined,
      selectedOptionChoiceIds: Array.isArray(item?.selectedOptionChoiceIds)
        ? item.selectedOptionChoiceIds.filter(
            (id: any) => typeof id === 'string',
          )
        : [],
      specialInstructions:
        typeof item?.specialInstructions === 'string'
          ? item.specialInstructions.slice(0, 200)
          : '',
    }))
    .filter(
      (item) =>
        !!item.menuItemId &&
        Number.isFinite(item.quantity) &&
        item.quantity > 0,
    ) as Array<{
    cartLineId: string
    menuItemId: string
    quantity: number
    name?: string
    selectedOptionChoiceIds: Array<string>
    specialInstructions: string
  }>

  if (normalized.length === 0) {
    return res.json({ active: [], removed: [], adjusted: [] })
  }

  try {
    const result = await refreshCartItems(normalized)
    return res.json(result)
  } catch (error: any) {
    console.error('Refresh cart error: ', error)
    return res.status(500).json({ error: 'Failed to refresh cart.' })
  }
})

// POST /api/public/orders
publicRouter.post('/orders', async (req, res) => {
  const {
    customerName,
    customerPhone,
    smsOptIn,
    tipSelection,
    customTipCents,
    items,
  } = req.body ?? {}

  if (!customerName || typeof customerName !== 'string') {
    return res.status(400).json({ error: 'Customer name is required.' })
  }

  if (!Array.isArray(items)) {
    return res.status(400).json({ error: 'Items must be an array.' })
  }

  let smsConsent
  try {
    smsConsent = prepareSmsConsent({ customerPhone, smsOptIn })
  } catch (error) {
    if (error instanceof SmsConsentValidationError) {
      return res.status(400).json({ error: error.message })
    }
    throw error
  }

  const normalizedItems = items
    .map((item: any) => ({
      cartLineId:
        item && typeof item.cartLineId === 'string'
          ? item.cartLineId
          : item?.menuItemId,
      menuItemId:
        item && typeof item.menuItemId === 'string' ? item.menuItemId : null,
      quantity:
        item && typeof item.quantity === 'number'
          ? Math.floor(item.quantity)
          : Number.NaN,
      name: item && typeof item.name === 'string' ? item.name : undefined,
      selectedOptionChoiceIds: Array.isArray(item?.selectedOptionChoiceIds)
        ? item.selectedOptionChoiceIds.filter(
            (id: any) => typeof id === 'string',
          )
        : [],
      specialInstructions:
        typeof item?.specialInstructions === 'string'
          ? item.specialInstructions.slice(0, 200)
          : '',
    }))
    .filter(
      (item) =>
        !!item.menuItemId &&
        Number.isFinite(item.quantity) &&
        item.quantity > 0,
    ) as Array<{
    cartLineId: string
    menuItemId: string
    quantity: number
    name?: string
    selectedOptionChoiceIds: Array<string>
    specialInstructions: string
  }>

  if (normalizedItems.length === 0) {
    return res.status(400).json({ error: 'Cart items are required.' })
  }

  try {
    const result = await createPublicOrder({
      customerName: customerName.trim(),
      ...smsConsent,
      tipSelection: typeof tipSelection === 'string' ? tipSelection : null,
      customTipCents:
        typeof customTipCents === 'number' ? customTipCents : null,
      items: normalizedItems,
    })

    return res.status(201).json(result)
  } catch (error: any) {
    if (error instanceof OrderAvailabilityError) {
      return res.status(409).json({
        error:
          'Availability changed while your order was submitted. Review your updated cart and try again.',
        ...error.availability,
      })
    }
    if (error instanceof CheckoutTipValidationError) {
      return res.status(400).json({ error: error.message })
    }
    console.error('Create public order error: ', error)
    return res.status(500).json({ error: 'Failed to create order.' })
  }
})

// POST /api/public/orders/:id/payment/resume
publicRouter.post('/orders/:id/payment/resume', async (req, res) => {
  try {
    const payment = await getPendingCheckoutSession(req.params.id)
    return res.json(payment)
  } catch (error: any) {
    const message = error?.message ?? 'Failed to resume payment.'
    const status = message.includes('not found') ? 404 : 400
    return res.status(status).json({ error: message })
  }
})

// POST /api/public/orders/:id/payment/cancel
publicRouter.post('/orders/:id/payment/cancel', async (req, res) => {
  try {
    const payment = await cancelPendingCheckout(req.params.id)
    return res.json(payment)
  } catch (error: any) {
    const message = error?.message ?? 'Failed to cancel payment.'
    const status = message.includes('not found') ? 404 : 400
    return res.status(status).json({ error: message })
  }
})

// POST /api/public/orders/:id/cancel
publicRouter.post('/orders/:id/cancel', async (req, res) => {
  const authorization = req.header('authorization') ?? ''
  const trackingJwt = authorization.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!trackingJwt) {
    return res
      .status(401)
      .json({ error: 'Order tracking authorization is required.' })
  }

  try {
    const order = await cancelPublicOrder({
      orderId: req.params.id,
      version: req.body?.version,
      trackingJwt,
    })
    return res.json({ order })
  } catch (error: any) {
    if (error instanceof OrderTrackingAuthorizationError) {
      return res.status(403).json({ error: error.message })
    }
    if (
      error instanceof OrderConflictError ||
      error instanceof CustomerCancellationUnavailableError
    ) {
      return res.status(409).json({ error: error.message })
    }
    const message = error?.message ?? 'Failed to cancel order.'
    return res
      .status(message.includes('not found') ? 404 : 400)
      .json({ error: message })
  }
})

// GET /api/public/orders/:id
publicRouter.get('/orders/:id', async (req, res) => {
  const { id } = req.params

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Order id is required.' })
  }

  try {
    const order = await getPublicOrder(id)
    return res.json({ order, trackingJwt: order.trackingJwt })
  } catch (error: any) {
    if (error?.message === 'Order not found.') {
      return res.status(404).json({ error: 'Order not found.' })
    }
    console.error('Get public order error: ', error)
    return res.status(500).json({ error: 'Failed to load order.' })
  }
})
