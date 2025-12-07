// src/server.ts
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import multer from 'multer'
import { eq } from 'drizzle-orm'
import {
  getUserFromToken,
  loginWithPassword,
  signupWithInvite,
  signSupabaseToken,
} from './api/auth'
import {
  activateSession,
  closeSession,
  createSession,
  listSessions,
} from './api/sessions'
import { createInvite } from './api/invite'
import {
  createMenuItem,
  deleteMenuItem,
  listMenuItems,
  updateMenuItem,
} from './api/menuItem'
import { publicRouter } from './api/public'
import {
  assignOrderToUser,
  listActiveSessionOrders,
  updateOrderStatus,
  unassignOrder,
} from './api/order'
import { db, schema } from './db/client'
import { supabaseService } from './lib/supabaseServiceClient'
import { reorderMenuItems } from './api/menuItem'

const MENU_IMAGE_BUCKET = process.env.SUPABASE_MENU_BUCKET || 'menu-images'
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
})

const app = express()
const PORT = process.env.PORT ?? 4000

app.use(cors())
app.use(express.json())
app.use('/api/public', publicRouter)

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string
        email: string
        role: string
        name?: string
      }
    }
  }
}

// --- Health check ---
app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

async function requireAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer')) {
      return res
        .status(401)
        .json({ error: 'Missing or invalid Authorization header.' })
    }

    const token = authHeader.slice('Bearer '.length).trim()
    const user = await getUserFromToken(token)

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      name: (user as any).name,
    }

    next()
  } catch (error: any) {
    console.error('Auth error:', error)
    return res.status(401).json({ error: 'Invalid or expired token.' })
  }
}

/**
 * AUTH ROUTES
 */

/**
 * POST /api/auth/signup
 * body: { email, password, inviteCode }
 */
app.post('/api/auth/signup', async (req, res) => {
  const { name, email, password, inviteCode } = req.body ?? {}
  if (!name || !email || !password || !inviteCode) {
    return res.status(400).json({
      error: 'Name, email, password, and inviteCode are required.',
    })
  }

  try {
    const result = await signupWithInvite({ name, email, password, inviteCode })
    res.status(201).json({ result })
  } catch (error: any) {
    res.status(400).json({
      error: error?.message ?? 'Signup failed.',
    })
  }
})

/**
 * POST /api/auth/login
 * body: { email, password }
 */
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body ?? {}
  if (!email || !password) {
    return res.status(400).json({
      error: 'Email and password are required.',
    })
  }

  try {
    const result = await loginWithPassword({ email, password })
    res.json(result)
  } catch (error: any) {
    return res.status(400).json({
      error: error?.message ?? 'Login failed.',
    })
  }
})

/**
 * GET /api/auth/me
 * headers: Authorization: Bearer <token>
 */
app.get('/api/auth/me', requireAuth, async (req, res) => {
  const supabaseJwt = signSupabaseToken(req.user!)
  res.json({ user: req.user, supabaseJwt })
})

app.patch('/api/auth/me', requireAuth, async (req, res) => {
  const { name } = req.body ?? {}
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Name is required.' })
  }

  try {
    const [user] = await db
      .update(schema.users)
      .set({ name: name.trim() })
      .where(eq(schema.users.id, req.user!.id))
      .returning({
        id: schema.users.id,
        name: schema.users.name,
        email: schema.users.email,
        role: schema.users.role,
      })

    res.json({ user })
  } catch (error: any) {
    console.error('Update profile error: ', error)
    res.status(500).json({ error: 'Failed to update profile.' })
  }
})

/**
 * Session routes
 */

//List all sessions
app.get('/api/sessions', requireAuth, async (_req, res) => {
  try {
    const sessions = await listSessions()
    res.json({ sessions })
  } catch (error: any) {
    console.error('List sessions error: ', error)
    res.status(500).json({ error: 'Failed to fetch sessions.' })
  }
})

//Create a new session
app.post('/api/sessions', requireAuth, async (req, res) => {
  const { name } = req.body ?? {}
  if (!name) {
    return res.status(400).json({ error: 'Name is required.' })
  }

  try {
    const session = await createSession(name)
    res.status(201).json({ session })
  } catch (error: any) {
    console.error('Create session error: ', error)
    res.status(500).json({ error: 'Failed to create session.' })
  }
})

//Activating a session
app.post('/api/sessions/:id/activate', requireAuth, async (req, res) => {
  const { id } = req.params
  try {
    const session = await activateSession(id)
    res.json({ session })
  } catch (error: any) {
    console.error('Activate session error: ', error)
    res
      .status(400)
      .json({ error: error?.message ?? 'Failed to activate session.' })
  }
})

//Deactivating a session
app.post('/api/sessions/:id/close', requireAuth, async (req, res) => {
  const { id } = req.params
  try {
    const session = await closeSession(id)
    res.json({ session })
  } catch (error: any) {
    console.error('Closing session error: ', error)
    res
      .status(400)
      .json({ error: error?.message ?? 'Failed to close session.' })
  }
})

app.post('/api/invites', requireAuth, async (req, res) => {
  const { role } = req.body ?? {}

  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Only ADMINS can create invites.' })
  }

  if (role !== 'ADMIN' && role !== 'WORKER') {
    return res
      .status(400)
      .json({ error: 'Role must be \"ADMIN\" or \"WORKER\".' })
  }

  try {
    const invite = await createInvite(role)
    res.status(201).json({ invite })
  } catch (error: any) {
    console.error('Create invite error: ', error)
    res.status(500).json({ error: 'Failed to create invite.' })
  }
})

/**
 * MenuItems routes
 */

//list menu items
app.get('/api/menu-items', requireAuth, async (_req, res) => {
  try {
    const items = await listMenuItems()
    res.json({ items })
  } catch (error: any) {
    console.error('List menu error: ', error)
    res.status(500).json({ error: 'Failed to fetch menu items.' })
  }
})

//create menu items (Admin only)
app.post('/api/menu-items', requireAuth, async (req, res) => {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Only admins can create menu items.' })
  }

  const { name, priceCents, imageUrl, imagePlaceholderUrl, badges, isActive } =
    req.body ?? {}

  if (!name || typeof priceCents !== 'number') {
    return res.status(400).json({
      error: 'Name and priceCents are required.',
    })
  }

  try {
    const item = await createMenuItem({
      name,
      priceCents,
      imageUrl,
      imagePlaceholderUrl,
      badges,
      isActive,
    })
    res.status(201).json({ item })
  } catch (error: any) {
    console.error('Create menu item error: ', error)
    res.status(500).json({ error: 'Failed to create menu item.' })
  }
})

// upload menu item image (Admin only)
app.post(
  '/api/uploads/menu-image',
  requireAuth,
  upload.single('file'),
  async (req, res) => {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only admins can upload images.' })
    }

    if (!supabaseService) {
      return res
        .status(500)
        .json({ error: 'Supabase service client is not configured.' })
    }

    const file = req.file
    if (!file) {
      return res.status(400).json({ error: 'File is required.' })
    }

    const ext = file.originalname.split('.').pop()
    const filePath = `menu-items/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext || 'jpg'}`

    const { data, error } = await supabaseService.storage
      .from(MENU_IMAGE_BUCKET)
      .upload(filePath, file.buffer, {
        contentType: file.mimetype || 'application/octet-stream',
        cacheControl: '3600',
        upsert: false,
      })

    if (error || !data?.path) {
      console.error('Upload error:', error)
      return res
        .status(500)
        .json({ error: error?.message ?? 'Failed to upload image.' })
    }

    // use long-lived signed URLs so bucket can remain private
    const { data: signed } = await supabaseService.storage
      .from(MENU_IMAGE_BUCKET)
      .createSignedUrl(data.path, 60 * 60 * 24 * 365) // 1 year

    const { data: signedThumb } = await supabaseService.storage
      .from(MENU_IMAGE_BUCKET)
      .createSignedUrl(data.path, 60 * 60 * 24 * 365, {
        transform: { width: 48, quality: 60 },
      })

    const publicUrl = signed?.signedUrl
    const placeholderUrl = signedThumb?.signedUrl
    if (!publicUrl || !placeholderUrl) {
      return res
        .status(500)
        .json({ error: 'Could not retrieve signed URLs for image.' })
    }

    res.status(201).json({ publicUrl, placeholderUrl })
  },
)

//update menu item (Admin only)
app.patch('/api/menu-items/:id', requireAuth, async (req, res) => {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Only admins can update menu items.' })
  }

  const { id } = req.params
  const { name, priceCents, imageUrl, imagePlaceholderUrl, badges, isActive } =
    req.body ?? {}

  try {
    const item = await updateMenuItem(id, {
      name,
      priceCents,
      imageUrl,
      imagePlaceholderUrl,
      badges,
      isActive,
    })
    res.json({ item })
  } catch (error: any) {
    console.error('Update menu item error: ', error)
    res
      .status(400)
      .json({ error: error?.message ?? 'Failed to update menu item' })
  }
})

// reorder menu items (Admin only)
app.post('/api/menu-items/reorder', requireAuth, async (req, res) => {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Only admins can reorder menu items.' })
  }
  const { ids } = req.body ?? {}
  if (!Array.isArray(ids) || ids.some((id: any) => typeof id !== 'string')) {
    return res.status(400).json({ error: 'ids must be an array of strings.' })
  }
  try {
    const items = await reorderMenuItems(ids)
    res.json({ items })
  } catch (error: any) {
    console.error('Reorder menu items error: ', error)
    res.status(500).json({ error: 'Failed to reorder menu items.' })
  }
})

//delete menu item (Admin only)
app.delete('/api/menu-items/:id', requireAuth, async (req, res) => {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Only admins can delete menu items.' })
  }

  const { id } = req.params

  try {
    const item = await deleteMenuItem(id)
    res.json({ item })
  } catch (error: any) {
    console.error('Delete menu item error: ', error)
    res
      .status(400)
      .json({ error: error?.message ?? 'Failed to delete menu item.' })
  }
})

/**
 * Orders (admin/worker queue)
 */
app.get('/api/orders/active', requireAuth, async (_req, res) => {
  try {
    const orders = await listActiveSessionOrders()
    res.json({ orders })
  } catch (error: any) {
    console.error('List active orders error: ', error)
    if (error?.message?.includes('Active session not found')) {
      return res.status(400).json({ error: 'No active session.' })
    }
    res.status(500).json({ error: 'Failed to load orders.' })
  }
})

app.post('/api/orders/:id/assign', requireAuth, async (req, res) => {
  const { id } = req.params
  try {
    const order = await assignOrderToUser(id, req.user!.id)
    res.json({ order })
  } catch (error: any) {
    console.error('Assign order error: ', error)
    const message = error?.message ?? 'Failed to assign order.'
    const status = message.includes('not found') ? 404 : 400
    res.status(status).json({ error: message })
  }
})

app.patch('/api/orders/:id/status', requireAuth, async (req, res) => {
  const { id } = req.params
  const { status } = req.body ?? {}

  if (!status) {
    return res.status(400).json({ error: 'Status is required.' })
  }

  try {
    const order = await updateOrderStatus({
      orderId: id,
      status,
      userId: req.user!.id,
      userRole: req.user!.role,
    })
    res.json({ order })
  } catch (error: any) {
    console.error('Update order status error: ', error)
    const message = error?.message ?? 'Failed to update order.'
    const statusCode =
      message.includes('not found') || message.includes('Invalid')
        ? 400
        : 400
    res.status(statusCode).json({ error: message })
  }
})

app.post('/api/orders/:id/unassign', requireAuth, async (req, res) => {
  const { id } = req.params

  try {
    const order = await unassignOrder(id, req.user!.id)
    res.json({ order })
  } catch (error: any) {
    console.error('Unassign order error: ', error)
    const message = error?.message ?? 'Failed to unassign order.'
    const status = message.includes('not found') ? 404 : 400
    res.status(status).json({ error: message })
  }
})

export default app

if (!process.env.LAMBDA_TASK_ROOT) {
  app.listen(PORT, () =>
    console.log(`API server listening on http://localhost:${PORT}`),
  )
}
