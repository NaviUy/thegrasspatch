import {
  boolean,
  check,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

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
  position: integer('position'),
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

export const menuItemOptionGroups = pgTable(
  'menu_item_option_groups',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    menuItemId: uuid('menu_item_id')
      .notNull()
      .references(() => menuItems.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    selectionType: varchar('selection_type', { length: 20 }).notNull(),
    isRequired: boolean('is_required').notNull().default(false),
    minSelections: integer('min_selections').notNull().default(0),
    maxSelections: integer('max_selections'),
    position: integer('position').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    selectionLimitsValid: check(
      'menu_item_option_groups_selection_limits_valid',
      sql`${table.minSelections} >= 0 and (${table.maxSelections} is null or ${table.maxSelections} >= ${table.minSelections})`,
    ),
  }),
)

export const menuItemOptionChoices = pgTable(
  'menu_item_option_choices',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => menuItemOptionGroups.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    priceAdjustmentCents: integer('price_adjustment_cents')
      .notNull()
      .default(0),
    isDefault: boolean('is_default').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    priceAdjustmentNonnegative: check(
      'menu_item_option_choices_price_adjustment_nonnegative',
      sql`${table.priceAdjustmentCents} >= 0`,
    ),
  }),
)

/** SESSIONS (e.g. “Friday Night 7–10pm”) */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    isActive: boolean('is_active').notNull().default(false),
    nextOrderNumber: integer('next_order_number').notNull().default(1),
    waitEstimateMode: varchar('wait_estimate_mode', { length: 20 })
      .notNull()
      .default('AUTO'),
    manualWaitMinMinutes: integer('manual_wait_min_minutes'),
    manualWaitMaxMinutes: integer('manual_wait_max_minutes'),
    parallelPreparationCapacity: integer('parallel_preparation_capacity')
      .notNull()
      .default(1),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    nextOrderNumberPositive: check(
      'sessions_next_order_number_positive',
      sql`${table.nextOrderNumber} >= 1`,
    ),
    waitEstimateModeValid: check(
      'sessions_wait_estimate_mode_valid',
      sql`${table.waitEstimateMode} in ('AUTO', 'MANUAL', 'HIDDEN')`,
    ),
    manualWaitRangeValid: check(
      'sessions_manual_wait_range_valid',
      sql`(${table.manualWaitMinMinutes} is null and ${table.manualWaitMaxMinutes} is null) or (${table.manualWaitMinMinutes} >= 1 and ${table.manualWaitMaxMinutes} >= ${table.manualWaitMinMinutes})`,
    ),
    parallelPreparationCapacityPositive: check(
      'sessions_parallel_preparation_capacity_positive',
      sql`${table.parallelPreparationCapacity} >= 1`,
    ),
  }),
)

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
    // null means this item has unlimited inventory for the session
    inventoryLimit: integer('inventory_limit'),
    isSoldOut: boolean('is_sold_out').notNull().default(false),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.sessionId, table.menuItemId] }),
    inventoryLimitNonnegative: check(
      'session_menu_items_inventory_limit_nonnegative',
      sql`${table.inventoryLimit} is null or ${table.inventoryLimit} >= 0`,
    ),
  }),
)

export const sessionOptionChoices = pgTable(
  'session_option_choices',
  {
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    optionChoiceId: uuid('option_choice_id')
      .notNull()
      .references(() => menuItemOptionChoices.id, { onDelete: 'cascade' }),
    inventoryLimit: integer('inventory_limit'),
    isSoldOut: boolean('is_sold_out').notNull().default(false),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.sessionId, table.optionChoiceId] }),
    inventoryLimitNonnegative: check(
      'session_option_choices_inventory_limit_nonnegative',
      sql`${table.inventoryLimit} is null or ${table.inventoryLimit} >= 0`,
    ),
  }),
)

/** ORDERS (top-level order info) */
export const orders = pgTable(
  'orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),

    orderNumber: integer('order_number').notNull(),

    // 👇 new field
    customerName: varchar('customer_name', { length: 255 }).notNull(),

    customerPhone: text('customer_phone'),
    smsOptedInAt: timestamp('sms_opted_in_at', { withTimezone: true }),
    smsConsentVersion: varchar('sms_consent_version', { length: 50 }),

    status: varchar('status', { length: 20 }).notNull().default('PENDING'),

    version: integer('version').notNull().default(1),

    assignedWorkerId: uuid('assigned_worker_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    assignedAt: timestamp('assigned_at', { withTimezone: true }),
    makingAt: timestamp('making_at', { withTimezone: true }),

    totalPriceCents: integer('total_price_cents').notNull().default(0),

    trackingToken: uuid('tracking_token').notNull().defaultRandom(),

    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    fulfilledAt: timestamp('fulfilled_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelledByUserId: uuid('cancelled_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    cancellationReason: varchar('cancellation_reason', { length: 250 }),
    estimatedWaitMinMinutes: integer('estimated_wait_min_minutes'),
    estimatedWaitMaxMinutes: integer('estimated_wait_max_minutes'),
    waitEstimateSource: varchar('wait_estimate_source', { length: 20 }),
  },
  (table) => ({
    sessionOrderNumberUnique: uniqueIndex(
      'orders_session_order_number_unique',
    ).on(table.sessionId, table.orderNumber),
    orderNumberPositive: check(
      'orders_order_number_positive',
      sql`${table.orderNumber} >= 1`,
    ),
    versionPositive: check(
      'orders_version_positive',
      sql`${table.version} >= 1`,
    ),
    statusValid: check(
      'orders_status_valid',
      sql`${table.status} in ('PENDING', 'MAKING', 'READY', 'CANCELLED')`,
    ),
    estimatedWaitRangeValid: check(
      'orders_estimated_wait_range_valid',
      sql`(${table.estimatedWaitMinMinutes} is null and ${table.estimatedWaitMaxMinutes} is null) or (${table.estimatedWaitMinMinutes} >= 1 and ${table.estimatedWaitMaxMinutes} >= ${table.estimatedWaitMinMinutes})`,
    ),
  }),
)

/** ORDER ITEMS (line items inside each order) */
export const orderItems = pgTable('order_items', {
  id: uuid('id').defaultRandom().primaryKey(),

  orderId: uuid('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'cascade' }),

  menuItemId: uuid('menu_item_id')
    .notNull()
    .references(() => menuItems.id, { onDelete: 'restrict' }),

  itemName: varchar('item_name', { length: 255 }).notNull(),

  quantity: integer('quantity').notNull(),

  // how many have been fulfilled (for per-item checkboxes)
  fulfilledQuantity: integer('fulfilled_quantity').notNull().default(0),

  // price at the time of order (in cents)
  unitPriceCents: integer('unit_price_cents').notNull(),
  specialInstructions: varchar('special_instructions', { length: 200 }),
})

export const orderItemOptions = pgTable('order_item_options', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderItemId: uuid('order_item_id')
    .notNull()
    .references(() => orderItems.id, { onDelete: 'cascade' }),
  optionGroupId: uuid('option_group_id').references(
    () => menuItemOptionGroups.id,
    { onDelete: 'set null' },
  ),
  optionChoiceId: uuid('option_choice_id').references(
    () => menuItemOptionChoices.id,
    { onDelete: 'set null' },
  ),
  groupName: varchar('group_name', { length: 100 }).notNull(),
  choiceName: varchar('choice_name', { length: 100 }).notNull(),
  priceAdjustmentCents: integer('price_adjustment_cents').notNull().default(0),
})

/** Immutable history for staff-visible order changes. */
export const orderEvents = pgTable('order_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'cascade' }),
  actorUserId: uuid('actor_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  type: varchar('type', { length: 40 }).notNull(),
  reason: varchar('reason', { length: 250 }),
  before: jsonb('before').$type<Record<string, unknown> | null>(),
  after: jsonb('after').$type<Record<string, unknown> | null>(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
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
