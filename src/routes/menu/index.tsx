import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useActiveSession } from '@/hooks/useActiveSession'
import { useEffect, useState } from 'react'
import { api } from '@/lib/apiClient'
import { Button } from '@/components/ui/button'
import { ProductCard } from '@/components/ProductCard'
import { useCart } from '@/hooks/useCart'

export const Route = createFileRoute('/menu/')({
  component: RouteComponent,
})

type MenuItem = {
  id: string
  name: string
  priceCents: number
  imageUrl?: string | null
  imagePlaceholderUrl?: string | null
  isActive: boolean
}

function RouteComponent() {
  const router = useRouter()
  const {
    loading: sessionLoading,
    error: sessionError,
    open,
    session,
  } = useActiveSession()
  const [items, setItems] = useState<MenuItem[]>([])
  const [itemsLoading, setItemsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { items: cart, updateQuantity, totalItems, totalCents } = useCart()

  const loading = sessionLoading || itemsLoading
  const anyError = error ?? sessionError

  useEffect(() => {
    if (sessionLoading) return
    if (!open) {
      setItemsLoading(false)
      return
    }

    let cancelled = false

    async function loadMenu() {
      try {
        const { items } = await api.getPublicMenuItems()
        if (cancelled) return
        setItems(items as MenuItem[])
      } catch (error: any) {
        console.error(error)
        if (!cancelled) {
          setError(error.message ?? 'Failed to load menu.')
        }
      } finally {
        if (!cancelled) setItemsLoading(false)
      }
    }

    loadMenu()
    return () => {
      cancelled = true
    }
  }, [sessionLoading, open])

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

  if (!loading && !open) {
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

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-500">Loading menu…</p>
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
        {anyError && (
          <div className="rounded-md bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">
            {anyError}
          </div>
        )}
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
