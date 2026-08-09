import { Link, createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '@/lib/apiClient'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabaseClient'
import { formatOrderLabel } from '@/lib/orderNumber'
import { clearStoredCart } from '@/hooks/useCart'

type OrderItem = {
  id: string
  menuItemId: string
  name?: string | null
  quantity: number
  unitPriceCents: number
  specialInstructions?: string | null
  selectedOptions: Array<{
    groupName: string
    choiceName: string
    priceAdjustmentCents: number
  }>
}

type Order = {
  id: string
  orderNumber?: number | null
  status: string
  customerName: string
  customerPhone?: string | null
  totalPriceCents: number
  paymentStatus:
    | 'NOT_REQUIRED'
    | 'PENDING'
    | 'PAID'
    | 'PARTIALLY_REFUNDED'
    | 'REFUNDED'
    | 'FAILED'
    | 'EXPIRED'
  paymentExpiresAt?: string | null
  paidAt?: string | null
  checkoutTipCents?: number
  pendingCheckoutTipCents?: number
  postOrderTipCents?: number
  foodAmountRefundedCents?: number
  tipAmountRefundedCents?: number
  totalRefundedCents?: number
  paymentAmountDueCents?: number
  refundOutstandingCents?: number
  refundProgressStatus?: 'NONE' | 'PENDING' | 'FAILED'
  createdAt?: string
  estimatedWaitMinMinutes?: number | null
  estimatedWaitMaxMinutes?: number | null
  waitEstimateSource?: 'AUTO' | 'MANUAL' | null
  trackingJwt?: string
  items: Array<OrderItem>
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
  const [paymentAction, setPaymentAction] = useState<
    'RESUMING' | 'CANCELLING' | null
  >(null)
  const confirmationAttempted = useRef(false)
  const returnedCartCleared = useRef(false)

  const [error, setError] = useState<string | null>(null)
  const [realtimeGeneration, setRealtimeGeneration] = useState(0)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setOrder(null)

    async function load() {
      try {
        const { order: loadedOrder, trackingJwt: loadedTrackingJwt } =
          await api.getPublicOrder(orderId)
        if (cancelled) return
        setOrder(loadedOrder as Order)
        setTrackingJwt(loadedTrackingJwt)
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

  const paymentReturn =
    typeof window === 'undefined'
      ? null
      : new URLSearchParams(window.location.search).get('payment')

  useEffect(() => {
    if (
      paymentReturn !== 'success' ||
      order?.paymentStatus !== 'PENDING' ||
      confirmationAttempted.current
    ) {
      return
    }
    confirmationAttempted.current = true
    setPaymentAction('RESUMING')
    api
      .resumePublicOrderPayment(orderId)
      .then(() => api.getPublicOrder(orderId))
      .then(({ order: refreshedOrder, trackingJwt: refreshedTrackingJwt }) => {
        setOrder(refreshedOrder as Order)
        setTrackingJwt((current) => current ?? refreshedTrackingJwt)
      })
      .catch((err: any) => {
        console.error(err)
        setError(err.message ?? 'Failed to confirm payment.')
      })
      .finally(() => setPaymentAction(null))
  }, [order?.paymentStatus, orderId, paymentReturn])

  useEffect(() => {
    if (
      paymentReturn === 'success' &&
      !returnedCartCleared.current &&
      (order?.paymentStatus === 'PAID' ||
        order?.paymentStatus === 'PARTIALLY_REFUNDED' ||
        order?.paymentStatus === 'REFUNDED')
    ) {
      returnedCartCleared.current = true
      clearStoredCart()
      const cleanUrl = new URL(window.location.href)
      cleanUrl.searchParams.delete('payment')
      cleanUrl.searchParams.delete('session_id')
      window.history.replaceState({}, '', cleanUrl)
    }
  }, [order?.paymentStatus, paymentReturn])

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
            const { order: refreshedOrder, trackingJwt: refreshedTrackingJwt } =
              await api.getPublicOrder(orderId)
            if (!cancelled) {
              setOrder(refreshedOrder as Order)
              setTrackingJwt((current) => current ?? refreshedTrackingJwt)
            }
          } catch (err: any) {
            console.error(err)
            if (!cancelled) {
              setError((prev) => prev ?? err.message ?? 'Failed to refresh.')
            }
          }
        },
      )

      .subscribe((status, subscriptionError) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error(
            'Order tracking Realtime subscription error:',
            subscriptionError,
          )
        }
      })

    return () => {
      cancelled = true
      supabase?.removeChannel(channel)
    }
  }, [orderId, realtimeGeneration, trackingJwt])

  // Mobile browsers can silently suspend WebSockets in the background. Refresh
  // periodically while visible and immediately when the page resumes.
  useEffect(() => {
    if (!orderId) return
    let cancelled = false
    let refreshInFlight = false

    const refresh = () => {
      if (cancelled || refreshInFlight) return
      refreshInFlight = true
      api
        .getPublicOrder(orderId)
        .then(
          ({ order: refreshedOrder, trackingJwt: refreshedTrackingJwt }) => {
            if (cancelled) return
            setOrder(refreshedOrder as Order)
            setTrackingJwt((current) => current ?? refreshedTrackingJwt)
          },
        )
        .catch((err) => console.error('Polling error:', err))
        .finally(() => {
          refreshInFlight = false
        })
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
    }, 10000)

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
  }, [orderId])

  const trackerIndex = useMemo(() => {
    const key = (order?.status ?? 'PENDING').toUpperCase()
    const idx = TRACKING_STEPS.findIndex((step) => step.key === key)
    return idx === -1 ? 0 : idx
  }, [order])

  const tipUrl = useMemo(() => {
    const url = new URL('https://buy.stripe.com/5kQ3cwcmC9OQ4PX9iv1VK00')
    url.searchParams.set('client_reference_id', orderId)
    return url.toString()
  }, [orderId])

  const paymentPending = order?.paymentStatus === 'PENDING'
  const paymentIncomplete =
    order?.paymentStatus === 'FAILED' || order?.paymentStatus === 'EXPIRED'
  const paymentComplete =
    order?.paymentStatus === 'NOT_REQUIRED' ||
    order?.paymentStatus === 'PAID' ||
    order?.paymentStatus === 'PARTIALLY_REFUNDED' ||
    order?.paymentStatus === 'REFUNDED'
  const tipPaidCents =
    (order?.checkoutTipCents ?? 0) + (order?.postOrderTipCents ?? 0)
  const displayedCheckoutTipCents = paymentPending
    ? (order.pendingCheckoutTipCents ?? 0)
    : (order?.checkoutTipCents ?? 0)
  const paymentTimeRemaining = order?.paymentExpiresAt
    ? Math.max(0, new Date(order.paymentExpiresAt).getTime() - now)
    : null
  const paymentTimeLabel =
    paymentTimeRemaining === null
      ? null
      : `${Math.floor(paymentTimeRemaining / 60_000)}:${Math.floor(
          (paymentTimeRemaining % 60_000) / 1000,
        )
          .toString()
          .padStart(2, '0')}`

  const reloadOrder = async () => {
    const { order: refreshedOrder, trackingJwt: refreshedTrackingJwt } =
      await api.getPublicOrder(orderId)
    setOrder(refreshedOrder as Order)
    setTrackingJwt((current) => current ?? refreshedTrackingJwt)
  }

  const resumePayment = async () => {
    setPaymentAction('RESUMING')
    setError(null)
    try {
      const payment = await api.resumePublicOrderPayment(orderId)
      if (payment.checkoutUrl) {
        window.location.assign(payment.checkoutUrl)
        return
      }
      await reloadOrder()
    } catch (err: any) {
      console.error(err)
      setError(err.message ?? 'Failed to resume payment.')
    } finally {
      setPaymentAction(null)
    }
  }

  const cancelPayment = async () => {
    if (
      !window.confirm(
        'Cancel this order and release its reserved items back to the menu?',
      )
    ) {
      return
    }
    setPaymentAction('CANCELLING')
    setError(null)
    try {
      await api.cancelPublicOrderPayment(orderId)
      await reloadOrder()
    } catch (err: any) {
      console.error(err)
      setError(err.message ?? 'Failed to cancel payment.')
    } finally {
      setPaymentAction(null)
    }
  }

  const progressPercent = useMemo(() => {
    if (TRACKING_STEPS.length <= 1) return 100
    return (trackerIndex / (TRACKING_STEPS.length - 1)) * 100
  }, [trackerIndex])

  const statusBadgeClass = useMemo(() => {
    const status = (order?.status ?? 'PENDING').toUpperCase()
    if (status === 'READY') return 'bg-emerald-100 text-emerald-800'
    if (status === 'MAKING') return 'bg-amber-100 text-amber-800'
    if (status === 'CANCELLED') return 'bg-red-100 text-red-800'
    return 'bg-slate-200 text-slate-800'
  }, [order?.status])

  const estimatedReadyWindow = useMemo(() => {
    if (
      !order?.createdAt ||
      order.status === 'READY' ||
      order.status === 'CANCELLED' ||
      order.estimatedWaitMinMinutes == null ||
      order.estimatedWaitMaxMinutes == null
    ) {
      return null
    }
    const placedAt = new Date(order.createdAt).getTime()
    const start = new Date(placedAt + order.estimatedWaitMinMinutes * 60_000)
    const end = new Date(placedAt + order.estimatedWaitMaxMinutes * 60_000)
    return {
      start,
      end,
      overdue: now > end.getTime(),
    }
  }, [now, order])

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
              <p className="text-xs text-slate-500">
                {order
                  ? formatOrderLabel(order.orderNumber, order.id)
                  : 'Loading order…'}
              </p>
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
            <div
              className={`rounded-xl border px-4 py-4 ${
                paymentPending
                  ? 'border-amber-200 bg-amber-50'
                  : order.status === 'CANCELLED' || paymentIncomplete
                    ? 'border-red-200 bg-red-50'
                    : 'border-emerald-200 bg-emerald-50'
              }`}
            >
              <p
                className={`text-sm font-semibold ${
                  paymentPending
                    ? 'text-amber-900'
                    : order.status === 'CANCELLED' || paymentIncomplete
                      ? 'text-red-900'
                      : 'text-emerald-800'
                }`}
              >
                {paymentPending
                  ? paymentReturn === 'success'
                    ? 'Confirming your payment…'
                    : 'Payment is not complete yet.'
                  : paymentIncomplete
                    ? 'Payment was not completed.'
                    : order.status === 'CANCELLED'
                      ? `This order has been cancelled.`
                      : `Thanks, ${order.customerName}! We're on it.`}
              </p>
              <p
                className={`mt-1 text-xs ${
                  paymentPending
                    ? 'text-amber-800'
                    : order.status === 'CANCELLED' || paymentIncomplete
                      ? 'text-red-800'
                      : 'text-emerald-800'
                }`}
              >
                {paymentPending
                  ? 'Your items are reserved, but the kitchen will not receive the order until Stripe confirms payment.'
                  : paymentIncomplete
                    ? 'The reservation was released. Your cart is still available if you want to place a new order.'
                    : order.status === 'CANCELLED'
                      ? 'If you have questions, contact hello@thegrasspatch.cafe.'
                      : `We'll keep this page updated as your order moves to ready.`}
              </p>
            </div>

            {paymentPending && (
              <div className="rounded-xl border border-amber-200 bg-white px-4 py-4 space-y-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    Complete payment
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {paymentTimeLabel === '0:00'
                      ? 'The payment window is expiring. Refresh the status or start a new order.'
                      : `Reserved for ${paymentTimeLabel ?? 'up to 30 minutes'} more.`}
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    onClick={resumePayment}
                    disabled={paymentAction !== null}
                  >
                    {paymentAction === 'RESUMING'
                      ? 'Checking payment…'
                      : 'Resume secure payment'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={cancelPayment}
                    disabled={paymentAction !== null}
                  >
                    {paymentAction === 'CANCELLING'
                      ? 'Cancelling…'
                      : 'Cancel and release items'}
                  </Button>
                </div>
              </div>
            )}

            {paymentIncomplete && (
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-4">
                <p className="text-sm text-slate-600">
                  No payment was collected for this order.
                </p>
                <Button asChild className="mt-3">
                  <Link to="/checkout">Return to your cart</Link>
                </Button>
              </div>
            )}

            {paymentComplete && (
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

                {order.status === 'CANCELLED' ? (
                  <p className="text-sm text-slate-600">
                    Tracking has ended because this order was cancelled.
                  </p>
                ) : (
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
                                    active
                                      ? 'text-emerald-800'
                                      : 'text-slate-700'
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
                )}
              </div>
            )}

            {!paymentComplete ||
            order.status === 'CANCELLED' ? null : order.status === 'READY' ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4">
                <p className="text-sm font-semibold text-emerald-900">
                  Ready for pickup.
                </p>
              </div>
            ) : estimatedReadyWindow ? (
              <div
                className={`rounded-xl border px-4 py-4 ${
                  estimatedReadyWindow.overdue
                    ? 'border-amber-200 bg-amber-50'
                    : 'border-emerald-200 bg-emerald-50'
                }`}
              >
                <p className="text-sm font-semibold text-slate-900">
                  {estimatedReadyWindow.overdue
                    ? 'This is taking a little longer than estimated.'
                    : `Estimated ready between ${estimatedReadyWindow.start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} and ${estimatedReadyWindow.end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`}
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  Actual timing may vary. This estimate was saved when you
                  placed your order.
                </p>
              </div>
            ) : null}

            {order.refundProgressStatus === 'PENDING' && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4">
                <p className="text-sm font-semibold text-amber-900">
                  A ${formatDollars(order.refundOutstandingCents ?? 0)} refund
                  is processing.
                </p>
                <p className="mt-1 text-xs text-amber-800">
                  Stripe will return it to the original payment method.
                </p>
              </div>
            )}

            {order.refundProgressStatus === 'FAILED' && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-4">
                <p className="text-sm font-semibold text-red-900">
                  Your ${formatDollars(order.refundOutstandingCents ?? 0)}{' '}
                  refund has been delayed.
                </p>
                <p className="mt-1 text-xs text-red-800">
                  Staff has been notified and can retry it without charging you
                  again.
                </p>
              </div>
            )}

            {(order.paymentAmountDueCents ?? 0) > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4">
                <p className="text-sm font-semibold text-amber-900">
                  Your order changed by $
                  {formatDollars(order.paymentAmountDueCents ?? 0)} after
                  checkout.
                </p>
                <p className="mt-1 text-xs text-amber-800">
                  Please speak with staff about the difference. Stripe has not
                  charged it automatically.
                </p>
              </div>
            )}

            <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Order</span>
                <span className="font-semibold text-slate-900">
                  {formatOrderLabel(order.orderNumber, order.id)}
                </span>
              </div>
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
                  {paymentPending || paymentIncomplete
                    ? 'AWAITING PAYMENT'
                    : order.status}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Payment</span>
                <span className="font-semibold text-slate-900">
                  {order.paymentStatus.replaceAll('_', ' ')}
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
                    {item.selectedOptions.length > 0 && (
                      <p className="mt-1 text-xs text-slate-600">
                        {item.selectedOptions
                          .map((option) => option.choiceName)
                          .join(', ')}
                      </p>
                    )}
                    {item.specialInstructions && (
                      <p className="mt-1 text-xs italic text-slate-500">
                        Note: {item.specialInstructions}
                      </p>
                    )}
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

            <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 flex items-end justify-between gap-4">
              <div className="w-full max-w-xs space-y-1 text-sm">
                <div className="flex justify-between text-slate-600">
                  <span>Food</span>
                  <span>${formatDollars(order.totalPriceCents)}</span>
                </div>
                {displayedCheckoutTipCents > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>Checkout tip</span>
                    <span>${formatDollars(displayedCheckoutTipCents)}</span>
                  </div>
                )}
                {(order.totalRefundedCents ?? 0) > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <span>Refunded</span>
                    <span>
                      −${formatDollars(order.totalRefundedCents ?? 0)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between border-t border-slate-100 pt-1 text-base font-semibold text-slate-900">
                  <span>{paymentPending ? 'Amount due' : 'Order total'}</span>
                  <span>
                    $
                    {formatDollars(
                      order.totalPriceCents + displayedCheckoutTipCents,
                    )}
                  </span>
                </div>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link to="/menu">Order more</Link>
              </Button>
            </div>

            {paymentComplete && order.status !== 'CANCELLED' && (
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {tipPaidCents > 0
                      ? 'Thank you for supporting the team!'
                      : 'Want to leave a tip?'}
                  </p>
                  <p className="text-sm text-slate-600">
                    {tipPaidCents > 0
                      ? `Your verified tip total is $${formatDollars(tipPaidCents)}.`
                      : 'Add a tip and support the team (opens in a new tab).'}
                  </p>
                </div>
                {tipPaidCents === 0 && (
                  <Button asChild>
                    <a
                      href={tipUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full sm:w-auto text-center"
                    >
                      Tip the team
                    </a>
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </section>
    </main>
  )
}
