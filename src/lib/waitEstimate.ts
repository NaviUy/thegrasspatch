export type WaitEstimateMode = 'AUTO' | 'MANUAL' | 'HIDDEN'

export type WaitEstimateInput = {
  mode: WaitEstimateMode
  manualMinMinutes: number | null
  manualMaxMinutes: number | null
  parallelCapacity: number
  averagePreparationSeconds: number | null
  ordersAhead: number
}

export type WaitEstimate = {
  minMinutes: number | null
  maxMinutes: number | null
  source: 'AUTO' | 'MANUAL' | null
}

const FALLBACK_PREPARATION_MINUTES = 10
const RANGE_SIZE_MINUTES = 5
const MAX_AUTOMATIC_MINUTES = 180

export function calculateWaitEstimate(input: WaitEstimateInput): WaitEstimate {
  if (input.mode === 'HIDDEN') {
    return { minMinutes: null, maxMinutes: null, source: null }
  }
  if (input.mode === 'MANUAL') {
    return {
      minMinutes: input.manualMinMinutes,
      maxMinutes: input.manualMaxMinutes,
      source: 'MANUAL',
    }
  }

  const preparationMinutes =
    input.averagePreparationSeconds === null
      ? FALLBACK_PREPARATION_MINUTES
      : Math.max(1, input.averagePreparationSeconds / 60)
  const capacity = Math.max(1, Math.floor(input.parallelCapacity))
  const queuePosition = Math.max(0, Math.floor(input.ordersAhead)) + 1
  const preparationBatches = Math.ceil(queuePosition / capacity)
  const predictedMinutes = Math.min(
    MAX_AUTOMATIC_MINUTES - RANGE_SIZE_MINUTES,
    preparationMinutes * preparationBatches,
  )
  const minMinutes = Math.max(
    RANGE_SIZE_MINUTES,
    Math.floor(predictedMinutes / RANGE_SIZE_MINUTES) * RANGE_SIZE_MINUTES,
  )

  return {
    minMinutes,
    maxMinutes: minMinutes + RANGE_SIZE_MINUTES,
    source: 'AUTO',
  }
}

export function formatWaitEstimate(
  estimate?: { minMinutes: number | null; maxMinutes: number | null } | null,
) {
  if (estimate?.minMinutes === null || estimate?.maxMinutes === null)
    return null
  if (!estimate) return null
  return `${estimate.minMinutes}–${estimate.maxMinutes} minutes`
}
