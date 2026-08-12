export function formatOrderNumber(
  orderNumber: number | null | undefined,
  orderId: string,
) {
  if (Number.isInteger(orderNumber) && Number(orderNumber) >= 1) {
    return `#${orderNumber}`
  }
  return `#${orderId.slice(0, 6).toUpperCase()}`
}

export function formatOrderLabel(
  orderNumber: number | null | undefined,
  orderId: string,
) {
  return `Order ${formatOrderNumber(orderNumber, orderId)}`
}

export function matchesOrderSearch(
  order: {
    id: string
    orderNumber?: number | null
    customerName: string
  },
  query: string,
) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return true

  if (order.customerName.toLowerCase().includes(normalized)) return true

  const possibleNumber = normalized
    .replace(/^order\s*/, '')
    .replace(/^#/, '')
    .trim()

  if (/^\d+$/.test(possibleNumber)) {
    return order.orderNumber === Number(possibleNumber)
  }

  return formatOrderNumber(order.orderNumber, order.id)
    .toLowerCase()
    .includes(normalized)
}
