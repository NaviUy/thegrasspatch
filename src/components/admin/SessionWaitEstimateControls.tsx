import { useEffect, useState } from 'react'
import type { WaitEstimateMode } from '@/lib/waitEstimate'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/apiClient'
import { formatWaitEstimate } from '@/lib/waitEstimate'

type EstimateDetails = {
  mode: WaitEstimateMode
  manualMinMinutes: number | null
  manualMaxMinutes: number | null
  parallelCapacity: number
  averagePreparationSeconds: number | null
  sampleSize: number
  ordersAhead: number
  minMinutes: number | null
  maxMinutes: number | null
}

export function SessionWaitEstimateControls({
  sessionId,
}: {
  sessionId: string
}) {
  const [estimate, setEstimate] = useState<EstimateDetails | null>(null)
  const [mode, setMode] = useState<WaitEstimateMode>('AUTO')
  const [minimum, setMinimum] = useState('10')
  const [maximum, setMaximum] = useState('15')
  const [capacity, setCapacity] = useState('1')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const applyEstimate = (loaded: EstimateDetails) => {
    setEstimate(loaded)
    setMode(loaded.mode)
    setMinimum(String(loaded.manualMinMinutes ?? loaded.minMinutes ?? 10))
    setMaximum(String(loaded.manualMaxMinutes ?? loaded.maxMinutes ?? 15))
    setCapacity(String(loaded.parallelCapacity))
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api
      .getSessionWaitEstimate(sessionId)
      .then(({ estimate: loaded }) => {
        if (!cancelled) applyEstimate(loaded as EstimateDetails)
      })
      .catch((loadError: any) => {
        if (!cancelled) {
          setError(loadError.message ?? 'Failed to load wait settings.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [sessionId])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const { estimate: updated } = await api.updateSessionWaitEstimate(
        sessionId,
        {
          mode,
          manualMinMinutes: mode === 'MANUAL' ? Number(minimum) : null,
          manualMaxMinutes: mode === 'MANUAL' ? Number(maximum) : null,
          parallelCapacity: Number(capacity),
        },
      )
      applyEstimate(updated as EstimateDetails)
    } catch (saveError: any) {
      setError(saveError.message ?? 'Failed to save wait settings.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <p className="text-xs text-slate-500">Loading wait estimate…</p>
  }

  const currentEstimate = formatWaitEstimate(estimate)
  const averageMinutes = estimate?.averagePreparationSeconds
    ? Math.round(estimate.averagePreparationSeconds / 60)
    : null

  return (
    <div className="space-y-3 border-t border-slate-200 pt-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-slate-900">
            Customer wait estimate
          </p>
          <p className="text-xs text-slate-500">
            {currentEstimate
              ? `Currently showing ${currentEstimate}.`
              : 'Currently hidden from customers.'}
          </p>
        </div>
        {mode === 'AUTO' && estimate && (
          <p className="text-right text-xs text-slate-500">
            {estimate.ordersAhead} order
            {estimate.ordersAhead === 1 ? '' : 's'} ahead ·{' '}
            {averageMinutes === null
              ? '10 min fallback'
              : `${averageMinutes} min average from ${estimate.sampleSize}`}
          </p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <label className="space-y-1 text-xs font-medium text-slate-600">
          Mode
          <select
            className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900"
            value={mode}
            onChange={(event) =>
              setMode(event.target.value as WaitEstimateMode)
            }
          >
            <option value="AUTO">Automatic</option>
            <option value="MANUAL">Manual</option>
            <option value="HIDDEN">Hidden</option>
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium text-slate-600">
          Parallel capacity
          <Input
            type="number"
            min={1}
            max={20}
            value={capacity}
            onChange={(event) => setCapacity(event.target.value)}
          />
        </label>
        {mode === 'MANUAL' && (
          <>
            <label className="space-y-1 text-xs font-medium text-slate-600">
              Minimum minutes
              <Input
                type="number"
                min={1}
                max={240}
                value={minimum}
                onChange={(event) => setMinimum(event.target.value)}
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-slate-600">
              Maximum minutes
              <Input
                type="number"
                min={1}
                max={240}
                value={maximum}
                onChange={(event) => setMaximum(event.target.value)}
              />
            </label>
          </>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex justify-end">
        <Button type="button" size="sm" disabled={saving} onClick={handleSave}>
          {saving ? 'Saving…' : 'Save wait settings'}
        </Button>
      </div>
    </div>
  )
}
