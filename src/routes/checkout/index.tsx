import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { FormEvent, useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useCart, CartItem } from '@/hooks/useCart'
import { api } from '@/lib/apiClient'
import { useActiveSession } from '@/hooks/useActiveSession'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

type RemovedCartItem = {
  menuItemId: string
  name?: string
  reason: 'NOT_FOUND' | 'INACTIVE'
}

type RefreshCartResponse = {
  active: Array<{
    menuItemId: string
    name: string
    priceCents: number
    imageUrl?: string | null
    quantity: number
  }>
  removed: RemovedCartItem[]
}

export const Route = createFileRoute('/checkout/')({
  component: RouteComponent,
})

function formatDollars(cents: number) {
  return (cents / 100).toFixed(2)
}

function removalReasonCopy(reason: RemovedCartItem['reason']) {
  if (reason === 'INACTIVE') return 'No longer available'
  return 'Removed from the menu'
}

function RouteComponent() {
  const router = useRouter()
  const {
    loading: sessionLoading,
    error: sessionError,
    open,
    session,
  } = useActiveSession()
  const { items, setItems, totalItems, totalCents } = useCart()
  const [refreshing, setRefreshing] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [removedItems, setRemovedItems] = useState<RemovedCartItem[]>([])
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [smsOptIn, setSmsOptIn] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const changeQuantity = (menuItemId: string, delta: number) => {
    setItems((prev) => {
      const updated = prev
        .map((item) =>
          item.menuItemId === menuItemId
            ? { ...item, quantity: Math.max(0, item.quantity + delta) }
            : item,
        )
        .filter((item) => item.quantity > 0)
      return updated
    })
    toast.success('Cart updated')
  }

  const refreshCart = useCallback(
    async (cartItems: CartItem[]) => {
      setRefreshing(true)
      setError(null)

      try {
        if (cartItems.length === 0) {
          setRemovedItems([])
          return { active: [], removed: [] }
        }

        const payload = cartItems.map((item) => ({
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          name: item.name,
        }))

        const { active, removed } = (await api.refreshPublicCart(
          payload,
        )) as RefreshCartResponse

        setItems(
          active.map((item) => ({
            menuItemId: item.menuItemId,
            name: item.name,
            priceCents: item.priceCents,
            imageUrl: item.imageUrl ?? null,
            quantity: item.quantity,
          })),
        )
        setRemovedItems(removed ?? [])
        return { active, removed }
      } catch (err: any) {
        console.error(err)
        setError(err.message ?? 'Failed to refresh cart.')
        return null
      } finally {
        setRefreshing(false)
      }
    },
    [setItems],
  )

  useEffect(() => {
    refreshCart(items)
  }, [refreshCart])

  const showEmptyState = !refreshing && totalItems === 0
  const trimmedPhone = customerPhone.trim()

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    const refreshResult = await refreshCart(items)
    if (!refreshResult || refreshResult.active.length === 0) {
      setSubmitting(false)
      setError(
        'Some items are no longer available. Please update your cart and try again.',
      )
      return
    }

    try {
      if (trimmedPhone && !smsOptIn) {
        setSubmitting(false)
        setError('Please consent to SMS updates to use a phone number.')
        return
      }

      const response = await api.createPublicOrder({
        customerName: customerName.trim(),
        customerPhone: trimmedPhone || null,
        items: refreshResult.active.map((item) => ({
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          name: item.name,
        })),
      })

      const newOrderId = response.order?.id
      if (!newOrderId) {
        throw new Error('Order was created but no ID was returned.')
      }

      setItems([])
      setRemovedItems([])
      setCustomerName('')
      setCustomerPhone('')
      setSmsOptIn(false)

      await router.navigate({
        to: '/order/$orderId',
        params: { orderId: newOrderId },
      })
    } catch (err: any) {
      console.error(err)
      setError(err.message ?? 'Failed to place order.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col">
      <header className="w-full border-b border-slate-200 bg-white">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img
              src="/thegrasspatch.png"
              alt="The Grass Patch"
              className="w-10 h-10"
            />
            <div className="text-left">
              <p className="text-sm font-semibold text-slate-900">Checkout</p>
              {session && (
                <p className="text-xs text-slate-500">
                  Pick up at: {session.name}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refreshCart(items)}
              disabled={refreshing || items.length === 0}
            >
              {refreshing ? 'Refreshing…' : 'Refresh cart'}
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/menu">Back to menu</Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="flex-1 max-w-4xl mx-auto w-full px-4 py-6 space-y-4">
        {(sessionError || error) && (
          <div className="rounded-md bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">
            {sessionError ?? error}
          </div>
        )}
        {!sessionLoading && !open && (
          <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-2 text-sm text-amber-800">
            The store is currently closed. You can still review your cart.
          </div>
        )}

        <div className="flex items-baseline justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">
              Review your order
            </h1>
          </div>
          <p className="text-sm text-slate-600">
            {refreshing ? 'Checking availability…' : 'Up to date'}
          </p>
        </div>

        {refreshing ? (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600">
            Refreshing your cart…
          </div>
        ) : (
          <>
            {removedItems.length > 0 && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-sm font-medium text-red-800">
                  {removedItems.length} item
                  {removedItems.length === 1 ? ' was' : 's were'} removed from
                  your cart:
                </p>
                <ul className="mt-2 space-y-1 text-sm text-red-700">
                  {removedItems.map((item) => (
                    <li
                      key={item.menuItemId}
                      className="flex items-center justify-between gap-2"
                    >
                      <span>{item.name ?? 'Unknown item'}</span>
                      <span className="text-xs uppercase tracking-wide">
                        {removalReasonCopy(item.reason)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {showEmptyState ? (
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center text-slate-600">
                <p className="text-base font-medium text-slate-900">
                  {removedItems.length > 0
                    ? 'No available items left in your cart.'
                    : 'Your cart is empty.'}
                </p>
                <p className="text-sm text-slate-500 mt-1">
                  {removedItems.length > 0
                    ? 'Everything you selected is no longer available. Head back to the menu to start over.'
                    : 'Add items from the menu to start an order.'}
                </p>
                <Button asChild className="mt-4">
                  <Link to="/menu">Back to menu</Link>
                </Button>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-4">
                  <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
                    {items.map((item) => (
                      <div
                        key={item.menuItemId}
                        className="flex items-start justify-between gap-3 px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900">
                            {item.name}
                          </p>
                          <p className="text-xs text-slate-500">
                            ${formatDollars(item.priceCents)} each
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() =>
                                changeQuantity(item.menuItemId, -1)
                              }
                              disabled={item.quantity === 0}
                            >
                              -
                            </Button>
                            <span className="w-8 text-center text-sm">
                              {item.quantity}
                            </span>
                            <Button
                              type="button"
                              variant="default"
                              size="icon"
                              onClick={() =>
                                changeQuantity(item.menuItemId, +1)
                              }
                            >
                              +
                            </Button>
                          </div>
                          <p className="text-sm font-semibold text-slate-900">
                            ${formatDollars(item.quantity * item.priceCents)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-500">Subtotal</p>
                      <p className="text-lg font-semibold text-slate-900">
                        ${formatDollars(totalCents)}
                      </p>
                    </div>
                  </div>
                </div>

                <form
                  onSubmit={handleSubmit}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-5 space-y-4"
                >
                  <div className="space-y-1.5">
                    <Label htmlFor="customerName">Name</Label>
                    <Input
                      id="customerName"
                      name="customerName"
                      placeholder="Jane Doe"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      required
                      disabled={submitting}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="customerPhone">
                      Phone number (optional)
                    </Label>
                    <Input
                      id="customerPhone"
                      name="customerPhone"
                      placeholder="555-555-5555"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                    />
                  </div>

                  <div className="flex items-start gap-2">
                    <input
                      id="smsOptIn"
                      name="smsOptIn"
                      type="checkbox"
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                      checked={smsOptIn}
                      onChange={(e) => setSmsOptIn(e.target.checked)}
                      required={Boolean(trimmedPhone)}
                      disabled={submitting}
                    />
                    <Label
                      htmlFor="smsOptIn"
                      className="text-xs text-slate-500"
                    >
                      I agree to receive recurring SMS messages from The Grass
                      Patch about order updates. Msg & data rates may apply.
                      Reply STOP to opt out, HELP for help.
                    </Label>
                  </div>

                  <div className="flex flex-col items-center justify-between gap-2">
                    <div className="text-sm text-slate-600">
                      {trimmedPhone && !smsOptIn
                        ? 'Please check the box to opt in to SMS updates.'
                        : trimmedPhone
                          ? "We'll text you when your order is ready."
                          : 'You can opt in to SMS updates by adding a phone number.'}
                    </div>
                    <Button
                      className="w-full"
                      type="submit"
                      disabled={
                        submitting ||
                        refreshing ||
                        totalItems === 0 ||
                        !customerName.trim() ||
                        (trimmedPhone && !smsOptIn)
                      }
                    >
                      {submitting ? 'Placing order…' : 'Place order'}
                    </Button>
                  </div>
                </form>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  )
}
