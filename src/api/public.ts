import express from 'express'

import {
  getActiveSession,
  getActiveMenuItems,
  refreshCartItems,
} from './menuItem'
import { createPublicOrder, getPublicOrder } from './order'

export const publicRouter = express.Router()

//Get /api/public/active-session
publicRouter.get('/active-session', async (_req, res) => {
  try {
    const session = await getActiveSession()
    res.json({ open: true, session })
  } catch (error: any) {
    console.error('List menu error: ', error)
    res.status(500).json({ error: 'Failed to fetch active session.' })
  }
})

//Get /api/public/menu-items
publicRouter.get('/menu-items', async (_req, res) => {
  try {
    const session = await getActiveSession()
    const items = await getActiveMenuItems()
    res.set('Cache-Control', 'public, max-age=60')
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
      menuItemId:
        item && typeof item.menuItemId === 'string' ? item.menuItemId : null,
      quantity:
        item && typeof item.quantity === 'number'
          ? Math.floor(item.quantity)
          : Number.NaN,
      name: item && typeof item.name === 'string' ? item.name : undefined,
    }))
    .filter(
      (item) =>
        !!item.menuItemId &&
        Number.isFinite(item.quantity) &&
        item.quantity > 0,
    ) as Array<{ menuItemId: string; quantity: number; name?: string }>

  if (normalized.length === 0) {
    return res.json({ active: [], removed: [] })
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
  const { customerName, customerPhone, items } = req.body ?? {}

  if (!customerName || typeof customerName !== 'string') {
    return res.status(400).json({ error: 'Customer name is required.' })
  }

  if (!Array.isArray(items)) {
    return res.status(400).json({ error: 'Items must be an array.' })
  }

  const normalizedItems = items
    .map((item: any) => ({
      menuItemId:
        item && typeof item.menuItemId === 'string' ? item.menuItemId : null,
      quantity:
        item && typeof item.quantity === 'number'
          ? Math.floor(item.quantity)
          : Number.NaN,
      name: item && typeof item.name === 'string' ? item.name : undefined,
    }))
    .filter(
      (item) =>
        !!item.menuItemId &&
        Number.isFinite(item.quantity) &&
        item.quantity > 0,
    ) as Array<{ menuItemId: string; quantity: number; name?: string }>

  if (normalizedItems.length === 0) {
    return res.status(400).json({ error: 'Cart items are required.' })
  }

  try {
    const { order, removed, trackingJwt } = await createPublicOrder({
      customerName: customerName.trim(),
      customerPhone:
        customerPhone && typeof customerPhone === 'string'
          ? customerPhone.trim()
          : null,
      items: normalizedItems,
    })

    if (!order) {
      return res.status(400).json({
        error: 'Some items are no longer available. Please refresh your cart.',
        removed,
      })
    }

    return res.status(201).json({ order, removed, trackingJwt })
  } catch (error: any) {
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
