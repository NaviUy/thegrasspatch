import { Link, createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/apiClient'
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
  status: string
  customerName: string
  customerPhone?: string | null
  totalPriceCents: number
  createdAt?: string
  trackingJwt?: string
  items: OrderItem[]
}

const TRACKING_STEPS: Array<{
  key: string
  label: string
  description: string
}> = [
  {
    key: 'PENDING',
    label: 'Pending',
    description: 'We received your order.',
  },
  {
    key: 'MAKING',
    label: 'Making',
    description: 'We are preparing it.',
  },
  {
    key: 'READY',
    label: 'Ready',
    description: 'Ready for pickup.',
  },
]

export const Route = createFileRoute('/order/$orderId/')({
  component: RouteComponent,
})

function formatDollars(cents: number) {
  return (cents / 100).toFixed(2)
}

function RouteComponent() {
  const { orderId } = Route.useParams()
  const [order, setOrder] = useState<Order | null>(null)
  const [trackingJwt, setTrackingJwt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [error, setError] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setOrder(null)

    async function load() {
      try {
        const { order, trackingJwt } = await api.getPublicOrder(orderId)
        if (cancelled) return
        setOrder(order as Order)
        setTrackingJwt(trackingJwt ?? null)
      } catch (err: any) {
        console.error(err)
        if (!cancelled) {
          setError(err.message ?? 'Failed to load order.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [orderId])

  useEffect(() => {
    if (!supabase || !trackingJwt) return
    let cancelled = false

    supabase.realtime.setAuth(trackingJwt)

    const channel = supabase
      .channel(`public-order-${orderId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${orderId}`,
        },
        async () => {
          try {
            const { order, trackingJwt } = await api.getPublicOrder(orderId)
            if (!cancelled) {
              setOrder(order as Order)
              setTrackingJwt(trackingJwt ?? null)
            }
          } catch (err: any) {
            console.error(err)
            if (!cancelled) {
              setError((prev) => prev ?? err.message ?? 'Failed to refresh.')
            }
          }
        },
      )

      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setIsConnected(true)
        } else {
          setIsConnected(false)
        }
      })

    return () => {
      cancelled = true
      supabase?.removeChannel(channel)
    }
  }, [orderId, trackingJwt])

  // Polling fallback: refresh every 10 seconds ONLY if not connected
  useEffect(() => {
    if (!orderId || isConnected) return
    const interval = setInterval(() => {
      api
        .getPublicOrder(orderId)
        .then(({ order, trackingJwt }) => {
          setOrder(order as Order)
          if (trackingJwt) setTrackingJwt(trackingJwt)
        })
        .catch((err) => console.error('Polling error:', err))
    }, 10000)
    return () => clearInterval(interval)
  }, [orderId, isConnected])

  const trackerIndex = useMemo(() => {
    const key = (order?.status ?? 'PENDING').toUpperCase()
    const idx = TRACKING_STEPS.findIndex((step) => step.key === key)
    return idx === -1 ? 0 : idx
  }, [order])

  const progressPercent = useMemo(() => {
    if (TRACKING_STEPS.length <= 1) return 100
    return (trackerIndex / (TRACKING_STEPS.length - 1)) * 100
  }, [trackerIndex])

  const statusBadgeClass = useMemo(() => {
    const status = (order?.status ?? 'PENDING').toUpperCase()
    if (status === 'READY') return 'bg-emerald-100 text-emerald-800'
    if (status === 'MAKING') return 'bg-amber-100 text-amber-800'
    return 'bg-slate-200 text-slate-800'
  }, [order?.status])

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col">
      <header className="w-full border-b border-slate-200 bg-white">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img
              src="/thegrasspatch.png"
              alt="The Grass Patch"
              className="w-10 h-10"
            />
            <div className="text-left">
              <p className="text-sm font-semibold text-slate-900">
                Order confirmation
              </p>
              <p className="text-xs text-slate-500">Order ID: {orderId}</p>
            </div>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/menu">Back to menu</Link>
          </Button>
        </div>
      </header>

      <section className="flex-1 max-w-4xl mx-auto w-full px-4 py-6 space-y-4">
        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600">
            Loading your order…
          </div>
        ) : !order ? (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center text-slate-600">
            <p className="text-base font-medium text-slate-900">
              Order not found.
            </p>
            <p className="text-sm text-slate-500 mt-1">
              Double-check the link or start a new order.
            </p>
            <Button asChild className="mt-4">
              <Link to="/menu">Start a new order</Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4">
              <p className="text-sm font-semibold text-emerald-800">
                Thanks, {order.customerName}! We're on it.
              </p>
              <p className="text-xs text-emerald-800 mt-1">
                We'll keep this page updated as your order moves to ready.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    Order tracker
                  </p>
                  <p className="text-xs text-slate-500">
                    Live updates while your order moves to ready.
                  </p>
                </div>
                <span
                  className={`text-xs px-2 py-1 rounded-full font-semibold ${statusBadgeClass}`}
                >
                  {order.status}
                </span>
              </div>

              <div className="space-y-3">
                <div className="relative pt-6">
                  <div className="absolute left-0 right-0 top-3 h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="absolute left-0 top-0 h-full bg-emerald-500 transition-[width] duration-500 ease-out"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <div className="relative z-10 flex items-start justify-between gap-2">
                    {TRACKING_STEPS.map((step, index) => {
                      const active = index <= trackerIndex
                      const current = index === trackerIndex
                      return (
                        <div
                          key={step.key}
                          className="flex-1 min-w-0 flex flex-col items-center text-center gap-2"
                        >
                          <div
                            className={`h-4 w-4 rounded-full border-2 ${
                              active
                                ? 'bg-emerald-500 border-emerald-500'
                                : 'bg-white border-slate-300'
                            }`}
                          />
                          <div className="space-y-1">
                            <p
                              className={`text-xs font-semibold leading-tight ${
                                active ? 'text-emerald-800' : 'text-slate-700'
                              }`}
                            >
                              {step.label}
                            </p>
                            <p className="text-[11px] text-slate-500 leading-tight">
                              {step.description}
                            </p>
                            {current && (
                              <p className="text-[11px] text-emerald-700 font-medium">
                                In progress
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Customer</span>
                <span className="font-semibold text-slate-900">
                  {order.customerName}
                </span>
              </div>
              {order.customerPhone && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">Phone</span>
                  <span className="font-semibold text-slate-900">
                    {order.customerPhone}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Status</span>
                <span className="font-semibold text-slate-900">
                  {order.status}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Placed at</span>
                <span className="font-semibold text-slate-900">
                  {order.createdAt
                    ? new Date(order.createdAt).toLocaleTimeString()
                    : '—'}
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
              {order.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">
                      {item.name ?? 'Menu item'}
                    </p>
                    <p className="text-xs text-slate-500">
                      ${formatDollars(item.unitPriceCents)} each
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-slate-700">
                      Qty {item.quantity}
                    </p>
                    <p className="text-sm font-semibold text-slate-900">
                      ${formatDollars(item.quantity * item.unitPriceCents)}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Total</p>
                <p className="text-lg font-semibold text-slate-900">
                  ${formatDollars(order.totalPriceCents)}
                </p>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link to="/menu">Order more</Link>
              </Button>
            </div>
          </>
        )}
      </section>
    </main>
  )
}
