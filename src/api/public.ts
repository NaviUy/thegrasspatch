import express from 'express'

import {
  getActiveMenuItems,
  getActiveSession,
  refreshCartItems,
} from './menuItem'
import {
  OrderAvailabilityError,
  createPublicOrder,
  getPublicOrder,
} from './order'
import { SmsConsentValidationError, prepareSmsConsent } from '@/lib/smsConsent'

export const publicRouter = express.Router()

// Get /api/public/active-session
publicRouter.get('/active-session', async (_req, res) => {
  try {
    const session = await getActiveSession()
    res.json({ open: true, session })
  } catch (error: any) {
    console.error('List menu error: ', error)
    res.status(500).json({ error: 'Failed to fetch active session.' })
  }
})

// Get /api/public/menu-items
publicRouter.get('/menu-items', async (_req, res) => {
  try {
    const session = await getActiveSession()
    const items = await getActiveMenuItems()
    res.set('Cache-Control', 'no-store')
    return res.json({ session, items })
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
  const { customerName, customerPhone, smsOptIn, items } = req.body ?? {}

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
    const { order, removed, adjusted, trackingJwt } = await createPublicOrder({
      customerName: customerName.trim(),
      ...smsConsent,
      items: normalizedItems,
    })

    return res.status(201).json({ order, removed, adjusted, trackingJwt })
  } catch (error: any) {
    if (error instanceof OrderAvailabilityError) {
      return res.status(409).json({
        error:
          'Availability changed while your order was submitted. Review your updated cart and try again.',
        ...error.availability,
      })
    }
    console.error('Create public order error: ', error)
    return res.status(500).json({ error: 'Failed to create order.' })
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
