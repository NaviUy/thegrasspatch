import { Suspense } from 'react'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { api } from '@/lib/apiClient'
import { Button } from '@/components/ui/button'
import { ProductCard } from '@/components/ProductCard'
import { useCart } from '@/hooks/useCart'

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
}

function RouteComponent() {
  const router = useRouter()
  const { open, session, items } = Route.useLoaderData() as {
    open: boolean
    session: { name: string } | null
    items: MenuItem[]
  }
  const { items: cart, updateQuantity, totalItems, totalCents } = useCart()

  console.log(open, session, items)

  //cart helper
  const adjustQuantity = (item: MenuItem, delta: number) => {
    updateQuantity({
      menuItemId: item.id,
      name: item.name,
      priceCents: item.priceCents,
      imageUrl: item.imageUrl ?? null,
      // cart currently ignores placeholder; keeping API unchanged
      delta,
    })
  }

  const getQuantity = (itemId: string) =>
    cart.find((c) => c.menuItemId === itemId)?.quantity ?? 0

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
        <div className="flex items-baseline justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Menu</h2>
            <p className="text-sm text-slate-500">
              Tap + to add drinks to your order.
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
                  <div className="ml-auto flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => adjustQuantity(item, -1)}
                      disabled={qty === 0}
                    >
                      -
                    </Button>
                    <span className="w-6 text-center text-sm">{qty}</span>
                    <Button
                      type="button"
                      variant="default"
                      size="icon"
                      onClick={() => adjustQuantity(item, +1)}
                    >
                      +
                    </Button>
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
