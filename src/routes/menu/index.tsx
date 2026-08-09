import { Suspense } from 'react'
import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { toast } from 'sonner'
import { api } from '@/lib/apiClient'
import { Button } from '@/components/ui/button'
import { ProductCard } from '@/components/ProductCard'
import { useCart, type CartOption } from '@/hooks/useCart'
import {
  CustomizeItemDialog,
  type MenuOptionGroup,
} from '@/components/CustomizeItemDialog'
import { formatWaitEstimate } from '@/lib/waitEstimate'

export const Route = createFileRoute('/menu/')({
  loader: async () => {
    const { open, session } = await api.getPublicActiveSession()
    if (!open) return { open, session: null, items: [] }
    const { items } = await api.getPublicMenuItems()
    return { open, session, items }
  },
  errorComponent: ({ error }) => (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="text-center space-y-2">
        <p className="text-sm text-red-600">
          Failed to load menu: {error?.message ?? 'Unknown error'}
        </p>
        <Button asChild variant="outline">
          <Link to="/">Back home</Link>
        </Button>
      </div>
    </main>
  ),
  component: () => (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center bg-slate-50">
          <p className="text-sm text-slate-500">Loading menu…</p>
        </main>
      }
    >
      <RouteComponent />
    </Suspense>
  ),
})

type MenuItem = {
  id: string
  name: string
  priceCents: number
  imageUrl?: string | null
  imagePlaceholderUrl?: string | null
  badges?: Array<{ label: string; color: string }> | null
  isActive: boolean
  isSoldOut: boolean
  isLimitedAvailability: boolean
  availableQuantity: number | null
  options: Array<MenuOptionGroup>
}

function RouteComponent() {
  const router = useRouter()
  const { open, session, items } = Route.useLoaderData()
  const { items: cart, addConfiguredItem, totalItems, totalCents } = useCart()
  const waitEstimate = formatWaitEstimate(session?.estimatedWait)

  const addToCart = (
    item: MenuItem,
    configuration: {
      selectedOptions: Array<CartOption>
      specialInstructions: string
      priceCents: number
    },
  ) => {
    const itemQuantity = cart
      .filter((line) => line.menuItemId === item.id)
      .reduce((sum, line) => sum + line.quantity, 0)
    if (
      item.availableQuantity !== null &&
      itemQuantity >= item.availableQuantity
    ) {
      toast.error('No more are currently available.')
      return false
    }

    for (const option of configuration.selectedOptions) {
      const choice = item.options
        .flatMap((group) => group.choices)
        .find((candidate) => candidate.id === option.optionChoiceId)
      const quantityInCart = cart.reduce(
        (sum, line) =>
          line.selectedOptions.some(
            (selected) => selected.optionChoiceId === option.optionChoiceId,
          )
            ? sum + line.quantity
            : sum,
        0,
      )
      if (
        choice?.remainingQuantity !== null &&
        choice?.remainingQuantity !== undefined &&
        quantityInCart >= choice.remainingQuantity
      ) {
        toast.error(`${choice.name} is no longer available for another item.`)
        return false
      }
    }

    addConfiguredItem({
      menuItemId: item.id,
      name: item.name,
      basePriceCents: item.priceCents,
      priceCents: configuration.priceCents,
      imageUrl: item.imageUrl ?? null,
      availableQuantity: item.availableQuantity,
      selectedOptions: configuration.selectedOptions,
      specialInstructions: configuration.specialInstructions,
    })
    toast.success(`Added ${item.name} to cart`)
    return true
  }

  const getQuantity = (itemId: string) =>
    cart
      .filter((line) => line.menuItemId === itemId)
      .reduce((sum, line) => sum + line.quantity, 0)

  if (!open) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-xl text-center space-y-4">
          <h1 className="text-2xl font-semibold text-slate-900">
            Store is currently closed
          </h1>
          <p className="text-sm text-slate-500">
            Please check back when the event is live.
          </p>
          <Button asChild variant="outline">
            <Link to="/">Back to home</Link>
          </Button>
        </div>
      </main>
    )
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
              <p className="text-sm font-semibold text-slate-900">
                The Grass Patch
              </p>
              {session && (
                <p className="text-xs text-slate-500">
                  Pick up at: {session.name}
                </p>
              )}
            </div>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/">Back home</Link>
          </Button>
        </div>
      </header>

      <section className="flex-1 max-w-5xl mx-auto w-full px-4 py-6 space-y-4">
        {waitEstimate && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <p className="text-sm font-semibold text-emerald-900">
              Estimated wait: {waitEstimate}
            </p>
            <p className="text-xs text-emerald-700">
              This is an estimate for a new order; actual timing may vary.
            </p>
          </div>
        )}
        <div className="flex items-baseline justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Menu</h2>
            <p className="text-sm text-slate-500">
              Choose an item to customize and add to your order.
            </p>
          </div>
          {totalItems > 0 && (
            <p className="text-sm text-slate-600">
              {totalItems} item{totalItems === 1 ? '' : 's'} in your order
            </p>
          )}
        </div>

        {items.length === 0 ? (
          <p className="text-sm text-slate-500">
            No items are available right now.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 justify-items-center pb-28">
            {items.map((item) => {
              const qty = getQuantity(item.id)
              return (
                <ProductCard
                  key={item.id}
                  title={item.name}
                  priceCents={item.priceCents}
                  imageUrl={item.imageUrl}
                  imagePlaceholderUrl={item.imagePlaceholderUrl}
                  badges={item.badges ?? []}
                  className="w-full max-w-xs"
                >
                  <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                    {item.isSoldOut ? (
                      <span className="w-full text-right text-xs font-semibold text-red-700">
                        Sold out
                      </span>
                    ) : item.isLimitedAvailability ? (
                      <span className="w-full text-right text-xs font-semibold text-amber-700">
                        Limited availability
                      </span>
                    ) : null}
                    {qty > 0 && (
                      <span className="text-sm text-slate-600">
                        {qty} in cart
                      </span>
                    )}
                    <CustomizeItemDialog
                      item={item}
                      onAdd={(configuration) => addToCart(item, configuration)}
                    />
                  </div>
                </ProductCard>
              )
            })}
          </div>
        )}
      </section>
      <footer className="w-full border-t border-slate-200 bg-white fixed bottom-0">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="text-sm text-slate-600">
            {totalItems === 0 ? (
              <span>No items in your order yet.</span>
            ) : (
              <span>
                {totalItems} item{totalItems === 1 ? '' : 's'} · $
                {(totalCents / 100).toFixed(2)}
              </span>
            )}
          </div>

          <Button
            size="sm"
            disabled={totalItems === 0}
            onClick={() => {
              router.navigate({ to: '/checkout' })
            }}
          >
            Review order
          </Button>
        </div>
      </footer>
    </main>
  )
}
