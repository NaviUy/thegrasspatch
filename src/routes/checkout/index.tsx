import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { FormEvent } from 'react'
import type { CartItem } from '@/hooks/useCart'
import type { CheckoutTipSelection } from '@/lib/checkoutTip'
import { Button } from '@/components/ui/button'
import { makeCartConfigurationKey, useCart } from '@/hooks/useCart'
import { api } from '@/lib/apiClient'
import { useActiveSession } from '@/hooks/useActiveSession'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatWaitEstimate } from '@/lib/waitEstimate'

type RemovedCartItem = {
  cartLineId: string
  menuItemId: string
  name?: string
  reason: 'NOT_FOUND' | 'INACTIVE' | 'SOLD_OUT' | 'OPTION_UNAVAILABLE'
}

type AdjustedCartItem = {
  cartLineId: string
  menuItemId: string
  name: string
  requestedQuantity: number
  availableQuantity: number
  reason: 'LIMITED_AVAILABILITY'
}

type RefreshCartResponse = {
  active: Array<{
    cartLineId: string
    menuItemId: string
    name: string
    basePriceCents: number
    priceCents: number
    imageUrl?: string | null
    quantity: number
    remainingQuantity: number | null
    selectedOptions: CartItem['selectedOptions']
    specialInstructions: string
  }>
  removed: Array<RemovedCartItem>
  adjusted: Array<AdjustedCartItem>
}

export const Route = createFileRoute('/checkout/')({
  component: RouteComponent,
})

function formatDollars(cents: number) {
  return (cents / 100).toFixed(2)
}

function customTipInputToCents(value: string) {
  const normalized = value.trim()
  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) return null
  const cents = Math.round(Number(normalized) * 100)
  return Number.isSafeInteger(cents) && cents >= 0 && cents <= 50_000
    ? cents
    : null
}

function removalReasonCopy(reason: RemovedCartItem['reason']) {
  if (reason === 'INACTIVE') return 'No longer available'
  if (reason === 'SOLD_OUT') return 'Sold out'
  if (reason === 'OPTION_UNAVAILABLE') return 'Option unavailable'
  return 'Removed from the menu'
}

function refreshedItemToCartItem(
  item: RefreshCartResponse['active'][number],
): CartItem {
  const configurationKey = makeCartConfigurationKey({
    menuItemId: item.menuItemId,
    selectedOptions: item.selectedOptions,
    specialInstructions: item.specialInstructions,
  })
  return {
    cartLineId: item.cartLineId,
    configurationKey,
    menuItemId: item.menuItemId,
    name: item.name,
    basePriceCents: item.basePriceCents,
    priceCents: item.priceCents,
    imageUrl: item.imageUrl ?? null,
    quantity: item.quantity,
    availableQuantity: item.remainingQuantity,
    selectedOptions: item.selectedOptions,
    specialInstructions: item.specialInstructions,
  }
}

function RouteComponent() {
  const router = useRouter()
  const {
    loading: sessionLoading,
    error: sessionError,
    open,
    session,
  } = useActiveSession()
  const { items, setItems, setQuantity, totalItems, totalCents } = useCart()
  const [refreshing, setRefreshing] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [removedItems, setRemovedItems] = useState<Array<RemovedCartItem>>([])
  const [adjustedItems, setAdjustedItems] = useState<Array<AdjustedCartItem>>(
    [],
  )
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [smsOptIn, setSmsOptIn] = useState(false)
  const [tipSelection, setTipSelection] = useState<CheckoutTipSelection>('NONE')
  const [customTipDollars, setCustomTipDollars] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const isDemoMode =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('mode') === 'demo'
  const waitEstimate = formatWaitEstimate(session?.estimatedWait)

  const changeQuantity = (item: CartItem, delta: number) => {
    const requested = item.quantity + delta
    const quantity =
      item.availableQuantity === null || item.availableQuantity === undefined
        ? requested
        : Math.min(requested, item.availableQuantity)
    setQuantity(item.cartLineId, quantity)
    toast.success('Cart updated')
  }

  const refreshCart = useCallback(
    async (
      cartItems: Array<CartItem>,
      options: { showLoading?: boolean } = {},
    ) => {
      const showLoading = options.showLoading ?? true
      if (showLoading) setRefreshing(true)
      setError(null)

      try {
        if (cartItems.length === 0) {
          setRemovedItems([])
          setAdjustedItems([])
          return { active: [], removed: [], adjusted: [] }
        }

        const payload = cartItems.map((item) => ({
          cartLineId: item.cartLineId,
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          name: item.name,
          selectedOptionChoiceIds: item.selectedOptions.map(
            (option) => option.optionChoiceId,
          ),
          specialInstructions: item.specialInstructions,
        }))

        const { active, removed, adjusted } = (await api.refreshPublicCart(
          payload,
        )) as RefreshCartResponse

        setItems(active.map(refreshedItemToCartItem))
        setRemovedItems(removed)
        setAdjustedItems(adjusted)
        return { active, removed, adjusted }
      } catch (err: any) {
        console.error(err)
        setError(err.message ?? 'Failed to refresh cart.')
        return null
      } finally {
        if (showLoading) setRefreshing(false)
      }
    },
    [setItems],
  )

  useEffect(() => {
    refreshCart(items)
  }, [refreshCart])

  useEffect(() => {
    if (!isDemoMode || items.length > 0) return
    let cancelled = false

    const loadDemoItem = async () => {
      try {
        const { items: menuItems } = await api.getPublicMenuItems()
        const activeItems = menuItems.filter(
          (item) => item.isActive !== false && item.isSoldOut !== true,
        )
        if (!activeItems.length) return
        const randomItem =
          activeItems[Math.floor(Math.random() * activeItems.length)]
        if (cancelled) return
        setItems([
          {
            cartLineId: crypto.randomUUID(),
            configurationKey: makeCartConfigurationKey({
              menuItemId: randomItem.id,
              selectedOptions: randomItem.options.flatMap((group: any) =>
                group.choices
                  .filter(
                    (choice: any) => choice.isDefault && !choice.isSoldOut,
                  )
                  .map((choice: any) => ({
                    optionGroupId: group.id,
                    optionChoiceId: choice.id,
                    groupName: group.name,
                    choiceName: choice.name,
                    priceAdjustmentCents: choice.priceAdjustmentCents,
                  })),
              ),
              specialInstructions: '',
            }),
            menuItemId: randomItem.id,
            name: randomItem.name,
            basePriceCents: randomItem.priceCents,
            priceCents:
              randomItem.priceCents +
              randomItem.options
                .flatMap((group: any) => group.choices)
                .filter((choice: any) => choice.isDefault && !choice.isSoldOut)
                .reduce(
                  (sum: number, choice: any) =>
                    sum + choice.priceAdjustmentCents,
                  0,
                ),
            imageUrl: randomItem.imageUrl ?? null,
            quantity: 1,
            availableQuantity: randomItem.availableQuantity,
            selectedOptions: randomItem.options.flatMap((group: any) =>
              group.choices
                .filter((choice: any) => choice.isDefault && !choice.isSoldOut)
                .map((choice: any) => ({
                  optionGroupId: group.id,
                  optionChoiceId: choice.id,
                  groupName: group.name,
                  choiceName: choice.name,
                  priceAdjustmentCents: choice.priceAdjustmentCents,
                })),
            ),
            specialInstructions: '',
          },
        ])
      } catch (err) {
        console.error(err)
      }
    }

    loadDemoItem()
    return () => {
      cancelled = true
    }
  }, [isDemoMode, items.length, setItems])

  const showEmptyState = !refreshing && totalItems === 0
  const trimmedPhone = customerPhone.trim()
  const customTipCents = customTipInputToCents(customTipDollars)
  const selectedTipCents =
    totalCents === 0 || tipSelection === 'NONE'
      ? 0
      : tipSelection === 'PERCENT_15'
        ? Math.round(totalCents * 0.15)
        : tipSelection === 'PERCENT_20'
          ? Math.round(totalCents * 0.2)
          : tipSelection === 'PERCENT_25'
            ? Math.round(totalCents * 0.25)
            : (customTipCents ?? 0)
  const customTipInvalid =
    totalCents > 0 && tipSelection === 'CUSTOM' && customTipCents === null
  const tipOptions: Array<{
    value: CheckoutTipSelection
    label: string
    amountCents: number
  }> = [
    { value: 'NONE', label: 'No tip', amountCents: 0 },
    {
      value: 'PERCENT_15',
      label: '15%',
      amountCents: Math.round(totalCents * 0.15),
    },
    {
      value: 'PERCENT_20',
      label: '20%',
      amountCents: Math.round(totalCents * 0.2),
    },
    {
      value: 'PERCENT_25',
      label: '25%',
      amountCents: Math.round(totalCents * 0.25),
    },
    { value: 'CUSTOM', label: 'Custom', amountCents: customTipCents ?? 0 },
  ]

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    const refreshResult = await refreshCart(items, { showLoading: false })
    if (!refreshResult || refreshResult.active.length === 0) {
      setSubmitting(false)
      setError(
        'Some items are no longer available. Please update your cart and try again.',
      )
      return
    }

    if (refreshResult.removed.length > 0 || refreshResult.adjusted.length > 0) {
      setSubmitting(false)
      setError(
        'Your cart was updated based on current availability. Please review it and submit again.',
      )
      return
    }

    try {
      if (trimmedPhone && !smsOptIn) {
        setSubmitting(false)
        setError('Please consent to SMS updates to use a phone number.')
        return
      }

      if (smsOptIn && !trimmedPhone) {
        setSubmitting(false)
        setError('Please enter a phone number to receive SMS updates.')
        return
      }

      const response = await api.createPublicOrder({
        customerName: customerName.trim(),
        customerPhone: trimmedPhone || null,
        smsOptIn,
        tipSelection: totalCents > 0 ? tipSelection : 'NONE',
        customTipCents: tipSelection === 'CUSTOM' ? customTipCents : undefined,
        items: refreshResult.active.map((item) => ({
          cartLineId: item.cartLineId,
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          name: item.name,
          selectedOptionChoiceIds: item.selectedOptions.map(
            (option) => option.optionChoiceId,
          ),
          specialInstructions: item.specialInstructions,
        })),
      })

      const newOrderId = response.order?.id
      if (!newOrderId) {
        throw new Error('Order was created but no ID was returned.')
      }

      if (response.paymentRequired) {
        if (!response.checkoutUrl) {
          throw new Error('Payment is required, but checkout is unavailable.')
        }
        window.location.assign(response.checkoutUrl)
        return
      }

      setItems([])
      setRemovedItems([])
      setAdjustedItems([])
      setCustomerName('')
      setCustomerPhone('')
      setSmsOptIn(false)
      setTipSelection('NONE')
      setCustomTipDollars('')

      await router.navigate({
        to: '/order/$orderId',
        params: { orderId: newOrderId },
      })
    } catch (err: any) {
      console.error(err)
      if (err.status === 409 && err.data) {
        const availability = err.data as RefreshCartResponse
        setItems(availability.active.map(refreshedItemToCartItem))
        setRemovedItems(availability.removed)
        setAdjustedItems(availability.adjusted)
      }
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
        {open && waitEstimate && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <span className="font-semibold">
              Estimated wait: {waitEstimate}.
            </span>{' '}
            Your order will keep the estimate shown when it is submitted.
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
                      key={item.cartLineId}
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

            {adjustedItems.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-sm font-medium text-amber-900">
                  We adjusted your cart to match current availability:
                </p>
                <ul className="mt-2 space-y-1 text-sm text-amber-800">
                  {adjustedItems.map((item) => (
                    <li key={item.cartLineId}>
                      {item.name}: {item.requestedQuantity} requested,{' '}
                      {item.availableQuantity} available
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
                        key={item.cartLineId}
                        className="flex items-start justify-between gap-3 px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900">
                            {item.name}
                          </p>
                          <p className="text-xs text-slate-500">
                            ${formatDollars(item.priceCents)} each
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
                        <div className="flex flex-col items-end gap-2">
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => changeQuantity(item, -1)}
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
                              onClick={() => changeQuantity(item, +1)}
                              disabled={
                                item.availableQuantity !== null &&
                                item.availableQuantity !== undefined &&
                                item.quantity >= item.availableQuantity
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
                    <label
                      htmlFor="smsOptIn"
                      className="text-xs text-slate-500 leading-relaxed"
                    >
                      By checking this box, I agree to receive transactional
                      text messages from The Grass Patch about my order. Message
                      frequency varies, typically one message per order. Msg &
                      data rates may apply. Reply STOP to opt out, HELP for
                      help. Consent is not a condition of purchase. View our{' '}
                      <Link to="/privacy" className="underline text-xs">
                        Privacy Policy
                      </Link>{' '}
                      and{' '}
                      <Link to="/terms" className="underline text-xs">
                        SMS Terms
                      </Link>
                      .
                    </label>
                  </div>
                  {totalCents > 0 ? (
                    <fieldset className="space-y-3 border-t border-slate-100 pt-4">
                      <legend className="text-sm font-medium text-slate-900">
                        Add a tip (optional)
                      </legend>
                      <p className="text-xs text-slate-500">
                        Tips go directly toward supporting the team.
                      </p>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {tipOptions.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            aria-pressed={tipSelection === option.value}
                            onClick={() => setTipSelection(option.value)}
                            disabled={submitting}
                            className={`rounded-lg border px-3 py-2 text-left transition-colors disabled:opacity-50 ${
                              tipSelection === option.value
                                ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                            }`}
                          >
                            <span className="block text-sm font-semibold">
                              {option.label}
                            </span>
                            {option.value !== 'CUSTOM' && (
                              <span className="block text-xs opacity-75">
                                ${formatDollars(option.amountCents)}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                      {tipSelection === 'CUSTOM' && (
                        <div className="space-y-1.5">
                          <Label htmlFor="customTip">Custom tip</Label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">
                              $
                            </span>
                            <Input
                              id="customTip"
                              name="customTip"
                              type="number"
                              min="0"
                              max="500"
                              step="0.01"
                              inputMode="decimal"
                              className="pl-7"
                              placeholder="0.00"
                              value={customTipDollars}
                              onChange={(event) =>
                                setCustomTipDollars(event.target.value)
                              }
                              aria-invalid={customTipInvalid}
                              disabled={submitting}
                            />
                          </div>
                          {customTipInvalid && (
                            <p className="text-xs text-red-600">
                              Enter a tip between $0 and $500 with no more than
                              two decimal places.
                            </p>
                          )}
                        </div>
                      )}
                      <div className="space-y-1 border-t border-slate-100 pt-3 text-sm">
                        <div className="flex justify-between text-slate-600">
                          <span>Food</span>
                          <span>${formatDollars(totalCents)}</span>
                        </div>
                        <div className="flex justify-between text-slate-600">
                          <span>Tip</span>
                          <span>${formatDollars(selectedTipCents)}</span>
                        </div>
                        <div className="flex justify-between font-semibold text-slate-900">
                          <span>Total due</span>
                          <span>
                            ${formatDollars(totalCents + selectedTipCents)}
                          </span>
                        </div>
                      </div>
                    </fieldset>
                  ) : (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3">
                      <p className="text-sm font-semibold text-emerald-900">
                        No payment is due for this prepaid order.
                      </p>
                      <p className="mt-1 text-xs text-emerald-800">
                        You can leave an optional tip after the order is
                        confirmed.
                      </p>
                    </div>
                  )}
                  <div className="flex flex-col items-center justify-between gap-2">
                    <div className="text-sm text-slate-600">
                      {trimmedPhone && !smsOptIn
                        ? 'Please check the box to opt in to SMS updates.'
                        : smsOptIn && !trimmedPhone
                          ? 'Please add a phone number for SMS updates.'
                          : trimmedPhone
                            ? "We'll text you when your order is ready."
                            : 'You can opt in to SMS updates by adding a phone number.'}
                    </div>
                    <Button
                      className="w-full"
                      type="submit"
                      disabled={
                        submitting ||
                        totalItems === 0 ||
                        !customerName.trim() ||
                        (Boolean(trimmedPhone) && !smsOptIn) ||
                        (smsOptIn && !trimmedPhone) ||
                        customTipInvalid
                      }
                    >
                      {submitting
                        ? totalCents > 0
                          ? 'Opening secure payment…'
                          : 'Placing order…'
                        : totalCents > 0
                          ? 'Continue to secure payment'
                          : 'Place order'}
                    </Button>
                    {totalCents > 0 && (
                      <p className="text-center text-xs text-slate-500">
                        You’ll complete payment securely on Stripe. Your items
                        are reserved for 30 minutes.
                      </p>
                    )}
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
