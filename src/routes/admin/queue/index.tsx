import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/apiClient'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { useAuthUser } from '@/hooks/useAuthUser'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabaseClient'

type OrderItem = {
  id: string
  menuItemId: string
  name?: string | null
  quantity: number
  unitPriceCents: number
}

type Order = {
  id: string
  sessionId: string
  customerName: string
  status: 'PENDING' | 'MAKING' | 'READY'
  assignedWorkerId?: string | null
  assignedWorkerName?: string | null
  totalPriceCents: number
  createdAt?: string
  items: OrderItem[]
}

const STATUS_OPTIONS: Array<{
  value: Order['status']
  label: string
}> = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'MAKING', label: 'Making' },
  { value: 'READY', label: 'Ready' },
]

type StatusFilter = 'PENDING' | 'MAKING' | 'READY' | 'ALL'

const STATUS_FILTERS: Array<{
  value: StatusFilter
  label: string
}> = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'MAKING', label: 'Making' },
  { value: 'READY', label: 'Ready' },
  { value: 'ALL', label: 'All' },
]

export const Route = createFileRoute('/admin/queue/')({
  component: RouteComponent,
})

function formatDollars(cents: number) {
  return (cents / 100).toFixed(2)
}

function OrderCard({
  order,
  onAssignToMe,
  onStatusChange,
  onUnassign,
  canDrag = false,
}: {
  order: Order
  onAssignToMe: (orderId: string) => void
  onStatusChange?: (orderId: string, status: Order['status']) => void
  onUnassign?: (orderId: string) => void
  canDrag?: boolean
}) {
  const color =
    order.status === 'READY'
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
        {order.items.slice(0, 3).map((item) => (
          <div key={item.id} className="flex justify-between">
            <span className="truncate">{item.name ?? 'Item'}</span>
            <span className="font-medium">
              {item.quantity} × ${formatDollars(item.unitPriceCents)}
            </span>
          </div>
        ))}
        {order.items.length > 3 && (
          <p className="text-[11px] text-slate-500">
            +{order.items.length - 3} more…
          </p>
        )}
      </div>
      {assignedLabel && (
        <p className="text-xs text-slate-600">{assignedLabel}</p>
      )}

      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-700">
          Total ${formatDollars(order.totalPriceCents)}
        </span>
        {!order.assignedWorkerId ? (
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

      {onStatusChange && (
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
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [assigning, setAssigning] = useState<string | null>(null)
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)
  const [unassigning, setUnassigning] = useState<string | null>(null)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('PENDING')

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
        const { orders } = await api.listActiveOrders('ALL')
        if (isCancelled?.()) return
        setOrders(orders as Order[])
        setActiveSessionId(orders[0]?.sessionId ?? null)
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

  const myOrders = useMemo(
    () =>
      orders.filter(
        (o) => o.assignedWorkerId === user?.id && o.status !== 'READY',
      ),
    [orders, user?.id],
  )

  const completedOrders = useMemo(
    () =>
      orders.filter(
        (o) => o.assignedWorkerId === user?.id && o.status === 'READY',
      ),
    [orders, user?.id],
  )

  const filteredOrders = useMemo(() => {
    if (statusFilter === 'ALL') return orders
    return orders.filter((o) => o.status === statusFilter)
  }, [orders, statusFilter])

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

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const orderId = event.dataTransfer.getData('text/plain')
    if (orderId) assignToMe(orderId)
  }

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
  }

  // Realtime updates via Supabase
  useEffect(() => {
    if (!supabase || !user) return
    let cancelled = false
    const channel = supabase
      .channel('orders-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        async (payload) => {
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
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [activeSessionId, fetchOrders, user])

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
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-slate-700">Show:</span>
            {STATUS_FILTERS.map((opt) => (
              <Button
                key={opt.value}
                size="sm"
                variant={statusFilter === opt.value ? 'default' : 'outline'}
                onClick={() => setStatusFilter(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
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

            {orders.length === 0 ? (
              <p className="text-sm text-slate-500">
                No orders for the active session yet.
              </p>
            ) : (
              <div className="space-y-3">
                {filteredOrders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    onAssignToMe={assignToMe}
                    canDrag
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
              <div className="space-y-3">
                {myOrders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    onAssignToMe={assignToMe}
                    onStatusChange={changeStatus}
                    onUnassign={unassign}
                    canDrag={false}
                  />
                ))}
              </div>
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
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}
