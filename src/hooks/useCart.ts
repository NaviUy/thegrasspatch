import { useEffect, useState } from 'react'

const CART_STORAGE_KEY = 'tgp_cart_v1'

export type CartItem = {
  menuItemId: string
  name: string
  priceCents: number
  quantity: number
  imageUrl?: string | null
}

function loadInitialCart(): CartItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
  } catch {
    return []
  }
}

export function useCart() {
  const [items, setItems] = useState<CartItem[]>(() => loadInitialCart())

  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items))
    } catch {
      // ignore
    }
  }, [items])

  const clear = () => setItems([])

  const updateQuantity = (input: {
    menuItemId: string
    name: string
    priceCents: number
    imageUrl?: string | null
    delta: number
  }) => {
    const { menuItemId, name, priceCents, imageUrl, delta } = input
    setItems((prev) => {
      const existing = prev.find((c) => c.menuItemId === menuItemId)
      const nextQty = (existing?.quantity ?? 0) + delta

      if (nextQty <= 0) {
        return prev.filter((c) => c.menuItemId !== menuItemId)
      }

      if (!existing) {
        return [
          ...prev,
          { menuItemId, name, priceCents, quantity: nextQty, imageUrl },
        ]
      }

      return prev.map((c) =>
        c.menuItemId === menuItemId ? { ...c, quantity: nextQty } : c,
      )
    })
  }

  const setQuantity = (menuItemId: string, quantity: number) => {
    if (quantity <= 0) {
      setItems((prev) => prev.filter((c) => c.menuItemId !== menuItemId))
      return
    }
    setItems((prev) => {
      const existing = prev.find((c) => c.menuItemId === menuItemId)
      if (!existing) return prev
      return prev.map((c) =>
        c.menuItemId === menuItemId ? { ...c, quantity } : c,
      )
    })
  }

  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0)
  const totalCents = items.reduce(
    (sum, i) => sum + i.quantity * i.priceCents,
    0,
  )

  return {
    items,
    setItems,
    clear,
    updateQuantity,
    setQuantity,
    totalItems,
    totalCents,
  }
}
