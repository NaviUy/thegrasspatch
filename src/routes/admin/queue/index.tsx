import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Reorder } from 'framer-motion'
import type { EditableOrder } from '@/components/admin/EditOrderDialog'
import { api } from '@/lib/apiClient'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { useAuthUser } from '@/hooks/useAuthUser'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabaseClient'
import { Input } from '@/components/ui/input'
import { formatOrderNumber, matchesOrderSearch } from '@/lib/orderNumber'
import { useActiveSession } from '@/hooks/useActiveSession'
import { formatWaitEstimate } from '@/lib/waitEstimate'
import { EditOrderDialog } from '@/components/admin/EditOrderDialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type OrderItem = {
  id: string
  menuItemId: string
  name?: string | null
  quantity: number
  unitPriceCents: number
  specialInstructions?: string | null
  selectedOptions: Array<{
    optionGroupId?: string | null
    optionChoiceId?: string | null
    groupName: string
    choiceName: string
    priceAdjustmentCents: number
  }>
}

type Order = {
  id: string
  sessionId: string
  orderNumber?: number | null
  customerName: string
  status: 'PENDING' | 'MAKING' | 'READY' | 'CANCELLED'
  version: number
  assignedWorkerId?: string | null
  assignedWorkerName?: string | null
  totalPriceCents: number
  paymentStatus: 'NOT_REQUIRED' | 'PAID' | 'PARTIALLY_REFUNDED' | 'REFUNDED'
  foodAmountPaidCents: number
  checkoutTipCents: number
  foodAmountRefundedCents: number
  tipAmountRefundedCents: number
  totalRefundedCents: number
  refundableOnCancelCents: number
  paymentAmountDueCents: number
  refundOutstandingCents: number
  refundProgressStatus: 'NONE' | 'PENDING' | 'FAILED'
  createdAt?: string
  cancellationReason?: string | null
  cancelledAt?: string | null
  items: Array<OrderItem>
}

const STATUS_OPTIONS: Array<{
  value: Order['status']
  label: string
}> = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'MAKING', label: 'Making' },
  { value: 'READY', label: 'Ready' },
]

type StatusFilter = 'PENDING' | 'MAKING' | 'READY' | 'CANCELLED' | 'ALL'

const STATUS_FILTERS: Array<{
  value: Exclude<StatusFilter, 'ALL'>
  label: string
}> = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'MAKING', label: 'Making' },
  { value: 'READY', label: 'Ready' },
  { value: 'CANCELLED', label: 'Cancelled' },
]

export const Route = createFileRoute('/admin/queue/')({
  component: RouteComponent,
})

function formatDollars(cents: number) {
  return (cents / 100).toFixed(2)
}

function orderEventLabel(type: string) {
  if (type === 'ORDER_CANCELLED') return 'Order cancelled'
  if (type === 'ORDER_CORRECTED') return 'Order corrected'
  if (type === 'ORDER_STATUS_CHANGED') return 'Status changed'
  if (type === 'ORDER_ASSIGNED') return 'Order assigned'
  if (type === 'ORDER_UNASSIGNED') return 'Order returned to pool'
  return 'Order updated'
}

function OrderCard({
  order,
  onAssignToMe,
  onStatusChange,
  onUnassign,
  onEdit,
  onCancel,
  onRetryRefund,
  onViewHistory,
  canDrag = false,
}: {
  order: Order
  onAssignToMe: (orderId: string) => void
  onStatusChange?: (orderId: string, status: Order['status']) => void
  onUnassign?: (orderId: string) => void
  onEdit?: (order: Order) => void
  onCancel?: (order: Order) => void
  onRetryRefund?: (order: Order) => void
  onViewHistory?: (order: Order) => void
  canDrag?: boolean
}) {
  const color =
    order.status === 'CANCELLED'
      ? 'bg-red-100 text-red-800'
      : order.status === 'READY'
        ? 'bg-emerald-100 text-emerald-800'
        : order.status === 'MAKING'
          ? 'bg-amber-100 text-amber-800'
          : 'bg-slate-200 text-slate-800'
  const assignedLabel = order.assignedWorkerName
    ? `Assigned to ${order.assignedWorkerName}`
    : null

  return (
    <div
      className="rounded-lg border border-slate-200 bg-white p-4 space-y-3 shadow-sm"
      draggable={canDrag}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', order.id)
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-900">
            {formatOrderNumber(order.orderNumber, order.id)} ·{' '}
            {order.customerName}
          </p>
          <p className="text-xs text-slate-500">
            {order.items.length} item{order.items.length === 1 ? '' : 's'}
          </p>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full ${color}`}>
          {order.status}
        </span>
      </div>

      <div className="space-y-1 text-xs text-slate-600">
        {order.items.map((item) => (
          <div
            key={item.id}
            className="border-b border-slate-100 pb-1 last:border-0"
          >
            <div className="flex justify-between gap-2">
              <span>{item.name ?? 'Item'}</span>
              <span className="shrink-0 font-medium">
                {item.quantity} × ${formatDollars(item.unitPriceCents)}
              </span>
            </div>
            {item.selectedOptions.length > 0 && (
              <p className="text-[11px] text-slate-500">
                {item.selectedOptions
                  .map((option) => option.choiceName)
                  .join(', ')}
              </p>
            )}
            {item.specialInstructions && (
              <p className="text-[11px] font-medium italic text-slate-700">
                Note: {item.specialInstructions}
              </p>
            )}
          </div>
        ))}
      </div>
      {assignedLabel && (
        <p className="text-xs text-slate-600">{assignedLabel}</p>
      )}

      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-700">
          Total ${formatDollars(order.totalPriceCents)}
        </span>
        {order.status !== 'CANCELLED' && !order.assignedWorkerId ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onAssignToMe(order.id)}
          >
            Take order
          </Button>
        ) : onUnassign ? (
          <Button
            size="sm"
            variant="ghost"
            className="text-red-600"
            onClick={() => onUnassign(order.id)}
          >
            Return to pool
          </Button>
        ) : null}
      </div>

      <div className="space-y-1 rounded-md bg-slate-50 px-3 py-2 text-xs">
        <div className="flex items-center justify-between gap-2 text-slate-600">
          <span>Payment</span>
          <span className="font-semibold text-slate-800">
            {order.paymentStatus.replaceAll('_', ' ')}
          </span>
        </div>
        {order.totalRefundedCents > 0 && (
          <div className="flex items-center justify-between gap-2 text-emerald-700">
            <span>Refunded</span>
            <span className="font-semibold">
              ${formatDollars(order.totalRefundedCents)}
            </span>
          </div>
        )}
        {order.paymentAmountDueCents > 0 && (
          <p className="font-semibold text-amber-700">
            Staff reconciliation: ${formatDollars(order.paymentAmountDueCents)}{' '}
            was not charged automatically.
          </p>
        )}
        {order.refundProgressStatus === 'PENDING' && (
          <p className="font-semibold text-amber-700">
            Refund pending: ${formatDollars(order.refundOutstandingCents)}
          </p>
        )}
        {order.refundProgressStatus === 'FAILED' && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-red-700">
            <span className="font-semibold">
              Refund needs attention: $
              {formatDollars(order.refundOutstandingCents)}
            </span>
            {onRetryRefund && (
              <Button
                size="sm"
                variant="outline"
                className="border-red-200 text-red-700"
                onClick={() => onRetryRefund(order)}
              >
                Retry refund
              </Button>
            )}
          </div>
        )}
      </div>

      {(onEdit || onCancel || onViewHistory) && (
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          {onEdit && (
            <Button size="sm" variant="outline" onClick={() => onEdit(order)}>
              Edit order
            </Button>
          )}
          {onCancel && (
            <Button
              size="sm"
              variant="outline"
              className="border-red-200 text-red-700 hover:bg-red-50"
              onClick={() => onCancel(order)}
            >
              Cancel order
            </Button>
          )}
          {onViewHistory && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onViewHistory(order)}
            >
              History
            </Button>
          )}
        </div>
      )}

      {onStatusChange && order.status !== 'CANCELLED' && (
        <div className="flex items-center gap-2 flex-wrap">
          {STATUS_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              size="sm"
              variant={order.status === opt.value ? 'default' : 'outline'}
              onClick={() => onStatusChange(order.id, opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}

function RouteComponent() {
  const { user, loading: authLoading, error: authError } = useAuthUser()
  const { session: publicSession } = useActiveSession()
  const customerWaitEstimate = formatWaitEstimate(publicSession?.estimatedWait)
  const [orders, setOrders] = useState<Array<Order>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [assigning, setAssigning] = useState<string | null>(null)
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)
  const [unassigning, setUnassigning] = useState<string | null>(null)
  const [editingOrder, setEditingOrder] = useState<Order | null>(null)
  const [editMenuItems, setEditMenuItems] = useState<Array<any>>([])
  const [orderHistory, setOrderHistory] = useState<Array<any>>([])
  const [historyOrder, setHistoryOrder] = useState<Order | null>(null)
  const [viewHistoryEvents, setViewHistoryEvents] = useState<Array<any>>([])
  const [savingCorrection, setSavingCorrection] = useState(false)
  const [cancellingOrder, setCancellingOrder] = useState<Order | null>(null)
  const [cancellationReason, setCancellationReason] = useState('')
  const [cancellationError, setCancellationError] = useState<string | null>(
    null,
  )
  const [cancelling, setCancelling] = useState(false)
  const [retryingRefund, setRetryingRefund] = useState<string | null>(null)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [realtimeGeneration, setRealtimeGeneration] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedStatuses, setSelectedStatuses] = useState<
    Set<Exclude<StatusFilter, 'ALL'>>
  >(new Set(['PENDING', 'MAKING']))

  const upsertOrder = useCallback((order: Order) => {
    setOrders((prev) => {
      const exists = prev.some((o) => o.id === order.id)
      return exists
        ? prev.map((o) => (o.id === order.id ? order : o))
        : [...prev, order]
    })
  }, [])

  const fetchOrders = useCallback(
    async ({
      showLoader = true,
      isCancelled,
    }: {
      showLoader?: boolean
      isCancelled?: () => boolean
    } = {}) => {
      if (isCancelled?.()) return
      if (showLoader) setLoading(true)
      setError(null)

      try {
        const { orders: fetchedOrders } = await api.listActiveOrders('ALL')
        if (isCancelled?.()) return
        setOrders(fetchedOrders as Array<Order>)
        setActiveSessionId(fetchedOrders[0]?.sessionId ?? null)
      } catch (err: any) {
        console.error(err)
        if (!isCancelled?.()) {
          setError(err.message ?? 'Failed to load orders.')
        }
      } finally {
        if (showLoader && !isCancelled?.()) setLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    if (authLoading || !user) return
    let cancelled = false

    fetchOrders({ isCancelled: () => cancelled })
    return () => {
      cancelled = true
    }
  }, [authLoading, fetchOrders, user])

  const manager = user?.role === 'OWNER' || user?.role === 'ADMIN'
  const canEditOrder = (order: Order) =>
    (order.status === 'PENDING' || order.status === 'MAKING') &&
    (manager || order.assignedWorkerId === user?.id)
  const canCancelOrder = (order: Order) =>
    order.status !== 'CANCELLED' &&
    (manager ||
      (order.assignedWorkerId === user?.id &&
        (order.status === 'PENDING' || order.status === 'MAKING')))

  const searchedOrders = useMemo(
    () => orders.filter((order) => matchesOrderSearch(order, searchQuery)),
    [orders, searchQuery],
  )

  const myOrders = useMemo(
    () =>
      searchedOrders.filter(
        (o) =>
          o.assignedWorkerId === user?.id &&
          (o.status === 'PENDING' || o.status === 'MAKING'),
      ),
    [searchedOrders, user?.id],
  )

  const completedOrders = useMemo(
    () =>
      searchedOrders.filter(
        (o) => o.assignedWorkerId === user?.id && o.status === 'READY',
      ),
    [searchedOrders, user?.id],
  )

  const filteredOrders = useMemo(() => {
    if (selectedStatuses.size === 0) return searchedOrders
    return searchedOrders.filter((o) => selectedStatuses.has(o.status))
  }, [searchedOrders, selectedStatuses])

  const toggleStatusFilter = (status: Exclude<StatusFilter, 'ALL'>) => {
    setSelectedStatuses((prev) => {
      const next = new Set(prev)
      if (next.has(status)) {
        next.delete(status)
      } else {
        next.add(status)
      }
      return next
    })
  }

  const assignToMe = async (orderId: string) => {
    setAssigning(orderId)
    setError(null)
    try {
      const { order } = await api.assignOrderToMe(orderId)
      upsertOrder(order as Order)
    } catch (err: any) {
      console.error(err)
      setError(err.message ?? 'Failed to assign order.')
    } finally {
      setAssigning(null)
    }
  }

  const changeStatus = async (orderId: string, status: Order['status']) => {
    setUpdatingStatus(orderId)
    setError(null)
    try {
      const { order } = await api.updateOrderStatus(orderId, status)
      upsertOrder(order as Order)
    } catch (err: any) {
      console.error(err)
      setError(err.message ?? 'Failed to update status.')
    } finally {
      setUpdatingStatus(null)
    }
  }

  const unassign = async (orderId: string) => {
    setUnassigning(orderId)
    setError(null)
    try {
      const { order } = await api.unassignOrder(orderId)
      upsertOrder(order as Order)
    } catch (err: any) {
      console.error(err)
      setError(err.message ?? 'Failed to return order to pool.')
    } finally {
      setUnassigning(null)
    }
  }

  const openEditor = async (order: Order) => {
    setEditingOrder(order)
    setOrderHistory([])
    setError(null)
    try {
      const [{ items }, { events }] = await Promise.all([
        api.getPublicMenuItems(),
        api.listOrderEvents(order.id),
      ])
      setEditMenuItems(items)
      setOrderHistory(events)
    } catch (err: any) {
      setError(err.message ?? 'Failed to load the order editor.')
    }
  }

  const openHistory = async (order: Order) => {
    setHistoryOrder(order)
    setViewHistoryEvents([])
    try {
      const { events } = await api.listOrderEvents(order.id)
      setViewHistoryEvents(events)
    } catch (err: any) {
      setError(err.message ?? 'Failed to load order history.')
    }
  }

  const saveCorrection = async (input: {
    version: number
    reason: string
    items: Array<{
      lineId?: string
      menuItemId: string
      quantity: number
      selectedOptionChoiceIds: Array<string>
      specialInstructions: string
    }>
  }) => {
    if (!editingOrder) return
    setSavingCorrection(true)
    setError(null)
    try {
      const { order } = await api.correctOrder(editingOrder.id, input)
      upsertOrder(order as Order)
      setEditingOrder(null)
    } catch (err: any) {
      setError(err.message ?? 'Failed to correct the order.')
      throw err
    } finally {
      setSavingCorrection(false)
    }
  }

  const confirmCancellation = async () => {
    if (!cancellingOrder || cancellationReason.trim().length < 2) return
    setCancelling(true)
    setError(null)
    setCancellationError(null)
    try {
      const { order } = await api.cancelOrder(
        cancellingOrder.id,
        cancellingOrder.version,
        cancellationReason.trim(),
      )
      upsertOrder(order as Order)
      setCancellingOrder(null)
      setCancellationReason('')
    } catch (err: any) {
      setCancellationError(err.message ?? 'Failed to cancel the order.')
    } finally {
      setCancelling(false)
    }
  }

  const retryRefund = async (order: Order) => {
    setRetryingRefund(order.id)
    setError(null)
    try {
      const { order: updated } = await api.retryOrderRefund(order.id)
      upsertOrder(updated as Order)
    } catch (err: any) {
      setError(err.message ?? 'Failed to retry the refund.')
    } finally {
      setRetryingRefund(null)
    }
  }

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const orderId = event.dataTransfer.getData('text/plain')
    if (orderId) assignToMe(orderId)
  }

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
  }

  const handleReorderMyOrders = (reordered: Array<Order>) => {
    setOrders((prev) => {
      const reorderedIds = new Set(reordered.map((o) => o.id))
      const remaining = prev.filter((o) => !reorderedIds.has(o.id))
      return [...reordered, ...remaining]
    })
  }

  // Realtime updates via Supabase
  useEffect(() => {
    if (!supabase || !user) return
    let cancelled = false
    if (user.supabaseJwt) {
      supabase.realtime.setAuth(user.supabaseJwt)
    }
    const channel = supabase
      .channel('orders-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        async (payload) => {
          console.log('Realtime event received:', payload)
          const sessionId =
            (payload.new as any)?.session_id ?? (payload.old as any)?.session_id
          if (activeSessionId && sessionId && sessionId !== activeSessionId) {
            return
          }
          await fetchOrders({
            showLoader: false,
            isCancelled: () => cancelled,
          })
        },
      )
      .subscribe((status, subscriptionError) => {
        console.log('Supabase Realtime status:', status)
        if (status === 'SUBSCRIBED') {
          console.log('Successfully subscribed to orders channel')
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error(
            'Supabase Realtime subscription error:',
            subscriptionError,
          )
        }
      })

    console.log(
      'Initializing Supabase Realtime with token:',
      user.supabaseJwt ? 'PRESENT' : 'MISSING',
    )

    return () => {
      cancelled = true
      supabase?.removeChannel(channel)
    }
  }, [activeSessionId, fetchOrders, realtimeGeneration, user])

  // Mobile browsers can silently suspend WebSockets in the background. Refresh
  // immediately on resume and periodically while visible as a safety net.
  useEffect(() => {
    if (authLoading || !user) return
    let cancelled = false
    let refreshInFlight = false

    const refresh = async () => {
      if (cancelled || refreshInFlight) return
      refreshInFlight = true
      try {
        await fetchOrders({
          showLoader: false,
          isCancelled: () => cancelled,
        })
      } finally {
        refreshInFlight = false
      }
    }

    const reconnectAndRefresh = () => {
      if (document.visibilityState !== 'visible') return
      supabase?.realtime.connect()
      setRealtimeGeneration((generation) => generation + 1)
      void refresh()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') reconnectAndRefresh()
    }

    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, 15000)

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('online', reconnectAndRefresh)
    window.addEventListener('pageshow', reconnectAndRefresh)

    return () => {
      cancelled = true
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('online', reconnectAndRefresh)
      window.removeEventListener('pageshow', reconnectAndRefresh)
    }
  }, [authLoading, fetchOrders, user])

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-sm text-slate-500">Loading queue…</div>
      </div>
    )
  }

  return (
    <AdminLayout user={user}>
      {(authError || error) && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">
          {authError ?? error}
        </div>
      )}

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-xl font-semibold text-slate-900">
                Orders queue
              </h1>
              <p className="text-sm text-slate-600">
                Active session orders only. Drag to assign to yourself.
              </p>
              {customerWaitEstimate && (
                <p className="mt-1 text-xs font-medium text-emerald-700">
                  Customers currently see {customerWaitEstimate}.
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-slate-700">Show:</span>
            {STATUS_FILTERS.map((opt) => (
              <Button
                key={opt.value}
                size="sm"
                variant={
                  selectedStatuses.has(opt.value) ? 'default' : 'outline'
                }
                onClick={() => toggleStatusFilter(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
          <div className="max-w-md">
            <Input
              type="search"
              aria-label="Search orders"
              placeholder="Search by order number or customer name"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                All orders
              </h2>
              <span className="text-xs text-slate-500">
                {orders.length} total
              </span>
            </div>

            {filteredOrders.length === 0 ? (
              <p className="text-sm text-slate-500">
                {orders.length === 0
                  ? 'No orders for the active session yet.'
                  : 'No orders match the current filters.'}
              </p>
            ) : (
              <div className="space-y-3">
                {filteredOrders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    onAssignToMe={assignToMe}
                    canDrag={order.status !== 'CANCELLED'}
                    onEdit={canEditOrder(order) ? openEditor : undefined}
                    onCancel={
                      canCancelOrder(order) ? setCancellingOrder : undefined
                    }
                    onRetryRefund={
                      manager && retryingRefund !== order.id
                        ? retryRefund
                        : undefined
                    }
                    onViewHistory={openHistory}
                  />
                ))}
              </div>
            )}
          </div>

          <div
            className="space-y-3 rounded-xl border border-dashed border-emerald-300 bg-emerald-50/40 p-3"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">My queue</h2>
              <span className="text-xs text-slate-500">
                {myOrders.length} assigned
              </span>
            </div>
            <p className="text-xs text-emerald-700">
              Drag an order here or click “Take order” to assign it to yourself.
            </p>

            {myOrders.length === 0 ? (
              <p className="text-sm text-slate-500">
                You have no assigned orders.
              </p>
            ) : (
              <Reorder.Group
                as="div"
                axis="y"
                values={myOrders}
                onReorder={handleReorderMyOrders}
                className="space-y-3 list-none"
              >
                {myOrders.map((order) => (
                  <Reorder.Item
                    key={order.id}
                    value={order}
                    as="div"
                    className="cursor-grab active:cursor-grabbing"
                    whileDrag={{
                      scale: 1.01,
                      boxShadow: '0 8px 24px rgba(15,23,42,0.14)',
                    }}
                  >
                    <OrderCard
                      order={order}
                      onAssignToMe={assignToMe}
                      onStatusChange={changeStatus}
                      onUnassign={unassign}
                      canDrag={false}
                      onEdit={canEditOrder(order) ? openEditor : undefined}
                      onCancel={
                        canCancelOrder(order) ? setCancellingOrder : undefined
                      }
                      onRetryRefund={
                        manager && retryingRefund !== order.id
                          ? retryRefund
                          : undefined
                      }
                      onViewHistory={openHistory}
                    />
                  </Reorder.Item>
                ))}
              </Reorder.Group>
            )}

            {assigning && (
              <p className="text-xs text-emerald-700">
                Assigning order {assigning.slice(0, 6)}…
              </p>
            )}
            {updatingStatus && (
              <p className="text-xs text-emerald-700">
                Updating status for {updatingStatus.slice(0, 6)}…
              </p>
            )}
            {unassigning && (
              <p className="text-xs text-emerald-700">
                Returning order {unassigning.slice(0, 6)} to pool…
              </p>
            )}
          </div>

          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                Completed orders
              </h2>
              <span className="text-xs text-slate-500">
                {completedOrders.length} ready
              </span>
            </div>
            {completedOrders.length === 0 ? (
              <p className="text-sm text-slate-500">
                No completed orders assigned to you yet.
              </p>
            ) : (
              <div className="space-y-3">
                {completedOrders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    onAssignToMe={assignToMe}
                    onStatusChange={changeStatus}
                    onUnassign={unassign}
                    canDrag={false}
                    onCancel={
                      canCancelOrder(order) ? setCancellingOrder : undefined
                    }
                    onRetryRefund={
                      manager && retryingRefund !== order.id
                        ? retryRefund
                        : undefined
                    }
                    onViewHistory={openHistory}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <EditOrderDialog
        order={editingOrder as EditableOrder | null}
        menuItems={editMenuItems}
        open={!!editingOrder}
        saving={savingCorrection}
        history={orderHistory}
        onOpenChange={(open) => {
          if (!open && !savingCorrection) setEditingOrder(null)
        }}
        onSave={saveCorrection}
      />

      <Dialog
        open={!!historyOrder}
        onOpenChange={(open) => {
          if (!open) setHistoryOrder(null)
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Order history</DialogTitle>
            <DialogDescription>
              {historyOrder
                ? `${formatOrderNumber(historyOrder.orderNumber, historyOrder.id)} for ${historyOrder.customerName}`
                : ''}
            </DialogDescription>
          </DialogHeader>
          {viewHistoryEvents.length === 0 ? (
            <p className="text-sm text-slate-500">
              No corrections or cancellations have been recorded.
            </p>
          ) : (
            <div className="space-y-3">
              {[...viewHistoryEvents].reverse().map((event) => {
                const before = event.before
                const after = event.after
                return (
                  <div
                    key={event.id}
                    className="rounded-lg border border-slate-200 p-3"
                  >
                    <p className="text-sm font-semibold text-slate-900">
                      {orderEventLabel(event.type)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {event.actorName ?? 'Staff'} ·{' '}
                      {new Date(event.createdAt).toLocaleString()}
                    </p>
                    {event.reason && (
                      <p className="mt-2 text-sm text-slate-700">
                        {event.reason}
                      </p>
                    )}
                    {event.type === 'ORDER_CORRECTED' && before && after && (
                      <details className="mt-2 text-xs text-slate-600">
                        <summary className="cursor-pointer font-medium text-slate-800">
                          View before and after
                        </summary>
                        <div className="mt-2 grid gap-3 sm:grid-cols-2">
                          {[
                            ['Before', before],
                            ['After', after],
                          ].map(([label, snapshot]: any) => (
                            <div
                              key={label}
                              className="rounded bg-slate-50 p-2"
                            >
                              <p className="font-semibold">{label}</p>
                              {(snapshot.items ?? []).map((item: any) => (
                                <p key={item.id} className="mt-1">
                                  {item.quantity} × {item.name}
                                  {item.selectedOptions?.length
                                    ? ` · ${item.selectedOptions.map((option: any) => option.choiceName).join(', ')}`
                                    : ''}
                                  {item.specialInstructions
                                    ? ` · Note: ${item.specialInstructions}`
                                    : ''}
                                </p>
                              ))}
                              <p className="mt-2 font-medium">
                                Total $
                                {formatDollars(snapshot.totalPriceCents ?? 0)}
                              </p>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setHistoryOrder(null)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!cancellingOrder}
        onOpenChange={(open) => {
          if (!open && !cancelling) {
            setCancellingOrder(null)
            setCancellationReason('')
            setCancellationError(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this order?</DialogTitle>
            <DialogDescription>
              {cancellingOrder
                ? `${formatOrderNumber(cancellingOrder.orderNumber, cancellingOrder.id)} for ${cancellingOrder.customerName} will leave the active queue and its inventory will be restored.${cancellingOrder.refundableOnCancelCents > 0 ? ` Stripe will automatically refund $${formatDollars(cancellingOrder.refundableOnCancelCents)}, including any remaining checkout tip.` : ''}`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div>
            <label
              htmlFor="cancellation-reason"
              className="text-sm font-semibold text-slate-900"
            >
              Cancellation reason
            </label>
            <textarea
              id="cancellation-reason"
              rows={3}
              maxLength={250}
              value={cancellationReason}
              onChange={(event) =>
                setCancellationReason(event.target.value.slice(0, 250))
              }
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              placeholder="For example: Customer requested cancellation"
            />
            <p className="mt-1 text-xs text-slate-500">
              This reason is kept in staff history and is not shown to the
              customer.
            </p>
            {cancellationError && (
              <p className="mt-2 text-sm text-red-600">{cancellationError}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={cancelling}
              onClick={() => setCancellingOrder(null)}
            >
              Keep order
            </Button>
            <Button
              type="button"
              disabled={cancelling || cancellationReason.trim().length < 2}
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={confirmCancellation}
            >
              {cancelling ? 'Cancelling…' : 'Cancel order'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  )
}
