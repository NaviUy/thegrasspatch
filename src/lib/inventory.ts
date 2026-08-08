export const LOW_INVENTORY_THRESHOLD = 5

export function getInventoryAvailability(input: {
  inventoryLimit: number | null
  quantitySold: number
  manuallySoldOut: boolean
}) {
  const remainingQuantity =
    input.inventoryLimit === null
      ? null
      : Math.max(0, input.inventoryLimit - input.quantitySold)
  const isSoldOut =
    input.manuallySoldOut ||
    (remainingQuantity !== null && remainingQuantity === 0)

  return {
    remainingQuantity,
    isSoldOut,
    isLimitedAvailability:
      !isSoldOut &&
      remainingQuantity !== null &&
      remainingQuantity <= LOW_INVENTORY_THRESHOLD,
  }
}

export function getAvailableCartQuantity(
  requestedQuantity: number,
  availability: {
    remainingQuantity: number | null
    isSoldOut: boolean
  },
) {
  if (availability.isSoldOut) return 0
  if (availability.remainingQuantity === null) return requestedQuantity
  return Math.min(requestedQuantity, availability.remainingQuantity)
}
