import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
  primaryKey,
  jsonb,
} from 'drizzle-orm/pg-core'

/** USERS: admins + workers */
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: varchar('role', { length: 20 }).notNull(), // 'OWNER' | 'ADMIN' | 'WORKER'
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  name: varchar('name', { length: 255 }).notNull(),
})

/** MENU ITEMS */
export const menuItems = pgTable('menu_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  imageUrl: text('image_url'),
  imagePlaceholderUrl: text('image_placeholder_url'),
  badges: jsonb('badges').$type<
    Array<{
      label: string
      color: string
    }>
  >(),
  priceCents: integer('price_cents').notNull(), // price in cents
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
})

/** SESSIONS (e.g. “Friday Night 7–10pm”) */
export const sessions = pgTable('sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  isActive: boolean('is_active').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
})

/** Which menu items are available in a session (optional per-session pricing) */
export const sessionMenuItems = pgTable(
  'session_menu_items',
  {
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    menuItemId: uuid('menu_item_id')
      .notNull()
      .references(() => menuItems.id, { onDelete: 'cascade' }),
    // optional override price for this session
    priceCents: integer('price_cents'),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.sessionId, table.menuItemId] }),
  }),
)

/** ORDERS (top-level order info) */
export const orders = pgTable('orders', {
  id: uuid('id').defaultRandom().primaryKey(),

  sessionId: uuid('session_id')
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),

  // 👇 new field
  customerName: varchar('customer_name', { length: 255 }).notNull(),

  customerPhone: text('customer_phone'),

  status: varchar('status', { length: 20 }).notNull().default('PENDING'),

  assignedWorkerId: uuid('assigned_worker_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  assignedAt: timestamp('assigned_at', { withTimezone: true }),

  totalPriceCents: integer('total_price_cents').notNull().default(0),

  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  fulfilledAt: timestamp('fulfilled_at', { withTimezone: true }),
})

/** ORDER ITEMS (line items inside each order) */
export const orderItems = pgTable('order_items', {
  id: uuid('id').defaultRandom().primaryKey(),

  orderId: uuid('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'cascade' }),

  menuItemId: uuid('menu_item_id')
    .notNull()
    .references(() => menuItems.id, { onDelete: 'restrict' }),

  quantity: integer('quantity').notNull(),

  // how many have been fulfilled (for per-item checkboxes)
  fulfilledQuantity: integer('fulfilled_quantity').notNull().default(0),

  // price at the time of order (in cents)
  unitPriceCents: integer('unit_price_cents').notNull(),
})

/** Optional: SMS log for Twilio later */
export const smsEvents = pgTable('sms_events', {
  id: uuid('id').defaultRandom().primaryKey(),

  orderId: uuid('order_id').references(() => orders.id, {
    onDelete: 'set null',
  }),

  phone: text('phone').notNull(),

  type: varchar('type', { length: 50 }).notNull(), // 'ORDER_CREATED' | 'ORDER_READY' | etc.

  message: text('message').notNull(),

  providerMessageId: text('provider_message_id'), // Twilio SID
  status: varchar('status', { length: 20 }).notNull().default('SENT'),

  sentAt: timestamp('sent_at', { withTimezone: true }).defaultNow().notNull(),
})

export const inviteTokens = pgTable('invite_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: varchar('code', { length: 64 }).notNull().unique(), // e.g. random string
  role: varchar('role', { length: 20 }).notNull(), // role granted to new user: 'WORKER' | 'ADMIN'
  createdByUserId: uuid('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  usedByUserId: uuid('used_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
})
