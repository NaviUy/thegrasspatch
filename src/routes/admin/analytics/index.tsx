import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { Button } from '@/components/ui/button'
import { useAuthUser } from '@/hooks/useAuthUser'
import { api } from '@/lib/apiClient'

type Session = {
  id: string
  name: string
  isActive: boolean
  createdAt: string
}

type Analytics = {
  session: Session
  summary: {
    orderCount: number
    itemCount: number
    revenueCents: number
    completedOrderCount: number
    outstandingOrderCount: number
    averagePreparationSeconds: number | null
  }
  popularProducts: Array<{
    menuItemId: string
    name: string
    quantity: number
    revenueCents: number
  }>
  tips: { status: 'NOT_TRACKED'; totalCents: null }
}

export const Route = createFileRoute('/admin/analytics/')({
  component: RouteComponent,
})

function dollars(cents: number) {
  return `$${(cents / 100).toFixed(2)}`
}

function preparationTime(seconds: number | null) {
  if (seconds === null) return '—'
  if (seconds < 60) return '< 1 min'
  return `${Math.round(seconds / 60)} min`
}

function csvFilename(session: Session) {
  const name = session.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${name || 'session'}-analytics.csv`
}

function RouteComponent() {
  const router = useRouter()
  const { user, loading: authLoading, error: authError } = useAuthUser()
  const [sessions, setSessions] = useState<Array<Session>>([])
  const [selectedSessionId, setSelectedSessionId] = useState('')
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [loadingSessions, setLoadingSessions] = useState(true)
  const [loadingAnalytics, setLoadingAnalytics] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (authLoading || !user) return
    if (user.role === 'WORKER') {
      router.navigate({ to: '/admin/queue' })
      return
    }
    let cancelled = false
    api
      .listSessions()
      .then(({ sessions: loadedSessions }) => {
        if (cancelled) return
        const typedSessions = loadedSessions as Array<Session>
        setSessions(typedSessions)
        const activeSession = typedSessions.find((session) => session.isActive)
        setSelectedSessionId(activeSession?.id ?? typedSessions.at(0)?.id ?? '')
      })
      .catch((loadError: any) => {
        if (!cancelled) {
          setError(loadError.message ?? 'Failed to load sessions.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingSessions(false)
      })
    return () => {
      cancelled = true
    }
  }, [authLoading, router, user])

  useEffect(() => {
    if (!selectedSessionId) {
      setAnalytics(null)
      return
    }
    let cancelled = false
    setLoadingAnalytics(true)
    setAnalytics(null)
    setError(null)
    api
      .getSessionAnalytics(selectedSessionId)
      .then(({ analytics: loadedAnalytics }) => {
        if (!cancelled) setAnalytics(loadedAnalytics as Analytics)
      })
      .catch((loadError: any) => {
        if (!cancelled) {
          setError(loadError.message ?? 'Failed to load analytics.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingAnalytics(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedSessionId])

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedSessionId) ?? null,
    [selectedSessionId, sessions],
  )
  const maximumProductQuantity = Math.max(
    1,
    ...(analytics?.popularProducts.map((product) => product.quantity) ?? []),
  )

  const handleExport = async () => {
    if (!selectedSession) return
    setExporting(true)
    setError(null)
    try {
      await api.downloadSessionAnalyticsCsv(
        selectedSession.id,
        csvFilename(selectedSession),
      )
    } catch (exportError: any) {
      setError(exportError.message ?? 'Failed to export CSV.')
    } finally {
      setExporting(false)
    }
  }

  if (authLoading || loadingSessions) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
        Loading analytics…
      </div>
    )
  }

  return (
    <AdminLayout user={user}>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              Session analytics
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Review sales and preparation performance for any session.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="space-y-1 text-sm font-medium text-slate-700">
              <span className="block">Session</span>
              <select
                value={selectedSessionId}
                onChange={(event) => setSelectedSessionId(event.target.value)}
                className="h-10 min-w-64 rounded-md border border-slate-200 bg-white px-3 text-sm"
              >
                {sessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.name}
                    {session.isActive ? ' (Active)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="button"
              variant="outline"
              disabled={!selectedSession || exporting}
              onClick={handleExport}
            >
              {exporting ? 'Exporting…' : 'Export CSV'}
            </Button>
          </div>
        </div>

        {(authError || error) && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {authError ?? error}
          </div>
        )}

        {sessions.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-500">
            Create a session before viewing analytics.
          </div>
        ) : loadingAnalytics || !analytics ? (
          <div className="rounded-xl border border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-500">
            Loading session report…
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ['Orders', analytics.summary.orderCount],
                ['Items sold', analytics.summary.itemCount],
                ['Gross revenue', dollars(analytics.summary.revenueCents)],
                [
                  'Average preparation',
                  preparationTime(analytics.summary.averagePreparationSeconds),
                ],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <p className="text-sm text-slate-500">{label}</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">
                    {value}
                  </p>
                </div>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <p className="text-sm text-slate-500">Completed orders</p>
                <p className="mt-1 text-xl font-semibold text-emerald-700">
                  {analytics.summary.completedOrderCount}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <p className="text-sm text-slate-500">Outstanding orders</p>
                <p className="mt-1 text-xl font-semibold text-amber-700">
                  {analytics.summary.outstandingOrderCount}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <p className="text-sm text-slate-500">Tips</p>
                <p className="mt-1 text-xl font-semibold text-slate-900">
                  Not tracked
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Stripe tip payments are not connected yet.
                </p>
              </div>
            </div>

            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Popular products
                </h2>
                <p className="text-sm text-slate-500">
                  Ranked by total quantity sold.
                </p>
              </div>
              {analytics.popularProducts.length === 0 ? (
                <p className="mt-6 text-sm text-slate-500">
                  No products have been ordered in this session.
                </p>
              ) : (
                <div className="mt-5 space-y-4">
                  {analytics.popularProducts.map((product, index) => (
                    <div key={product.menuItemId} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-medium text-slate-900">
                          {index + 1}. {product.name}
                        </span>
                        <span className="shrink-0 text-slate-600">
                          {product.quantity} sold ·{' '}
                          {dollars(product.revenueCents)}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-emerald-600"
                          style={{
                            width: `${(product.quantity / maximumProductQuantity) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </AdminLayout>
  )
}
