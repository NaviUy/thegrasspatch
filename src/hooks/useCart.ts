import { useEffect, useState } from 'react'

const CART_STORAGE_KEY = 'tgp_cart_v2'

export function clearStoredCart() {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(CART_STORAGE_KEY, '[]')
  } catch {}
}

export type CartOption = {
  optionGroupId: string
  optionChoiceId: string
  groupName: string
  choiceName: string
  priceAdjustmentCents: number
}

export type CartItem = {
  cartLineId: string
  configurationKey: string
  menuItemId: string
  name: string
  basePriceCents: number
  priceCents: number
  quantity: number
  imageUrl?: string | null
  availableQuantity?: number | null
  selectedOptions: Array<CartOption>
  specialInstructions: string
}

function loadInitialCart(): Array<CartItem> {
  if (typeof window === 'undefined') return []
  try {
    const parsed = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function makeCartConfigurationKey(input: {
  menuItemId: string
  selectedOptions: Array<CartOption>
  specialInstructions: string
}) {
  return JSON.stringify({
    menuItemId: input.menuItemId,
    choiceIds: input.selectedOptions
      .map((option) => option.optionChoiceId)
      .sort(),
    specialInstructions: input.specialInstructions.trim(),
  })
}

export function useCart() {
  const [items, setItems] = useState<Array<CartItem>>(() => loadInitialCart())

  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items))
    } catch {}
  }, [items])

  const clear = () => setItems([])

  const addConfiguredItem = (
    input: Omit<CartItem, 'cartLineId' | 'configurationKey' | 'quantity'>,
  ) => {
    const key = makeCartConfigurationKey(input)
    setItems((current) => {
      const existing = current.find((item) => item.configurationKey === key)
      if (existing) {
        return current.map((item) =>
          item.cartLineId === existing.cartLineId
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        )
      }
      return [
        ...current,
        {
          ...input,
          cartLineId: crypto.randomUUID(),
          configurationKey: key,
          quantity: 1,
        },
      ]
    })
  }

  const setQuantity = (cartLineId: string, quantity: number) => {
    setItems((current) =>
      quantity <= 0
        ? current.filter((item) => item.cartLineId !== cartLineId)
        : current.map((item) =>
            item.cartLineId === cartLineId ? { ...item, quantity } : item,
          ),
    )
  }

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0)
  const totalCents = items.reduce(
    (sum, item) => sum + item.quantity * item.priceCents,
    0,
  )

  return {
    items,
    setItems,
    clear,
    addConfiguredItem,
    setQuantity,
    totalItems,
    totalCents,
  }
}
