import { api } from '@/lib/apiClient'
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useAuthUser } from '@/hooks/useAuthUser'
import { useRouter } from '@tanstack/react-router'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

export const Route = createFileRoute('/admin/')({
  component: RouteComponent,
})

function RouteComponent() {
  const router = useRouter()
  const { user, loading: authLoading, error: authError } = useAuthUser()
  const [sessions, setSessions] = useState<any[]>([])
  const [newSessionName, setNewSessionName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sessionsLoading, setSessionsLoading] = useState(true)

  const loading = authLoading || sessionsLoading
  const errorMessage = error ?? authError

  useEffect(() => {
    if (authLoading || !user) return
    let cancelled = false

    async function loadSessions() {
      try {
        const { sessions } = await api.listSessions()
        if (!cancelled) {
          setSessions(sessions)
        }
      } catch (error: any) {
        console.error(error)
        if (!cancelled) {
          setError(error.message ?? 'Failed to load sessions.')
        }
      } finally {
        if (!cancelled) setSessionsLoading(false)
      }
    }

    loadSessions()
    return () => {
      cancelled = true
    }
  }, [authLoading, user])

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newSessionName.trim()) return
    try {
      const { session } = await api.createSession(newSessionName.trim())
      setSessions((prev) => [session, ...prev])
      setNewSessionName('')
    } catch (error: any) {
      console.error(error)
      setError(error.message ?? 'Failed to create session.')
    }
  }

  const handleActivate = async (id: string) => {
    try {
      const { session: activated } = await api.activateSession(id)
      setSessions((prev) =>
        prev.map((s) => ({
          ...s,
          isActive: s.id === activated.id,
        })),
      )
    } catch (error: any) {
      console.error(error)
      setError(error.message ?? 'Failed to activate session.')
    }
  }

  const handleClose = async (id: string) => {
    try {
      const { session: closed } = await api.closeSession(id)
      setSessions((prev) =>
        prev.map((s) => ({
          ...s,
          isActive: s.id === closed.id ? false : s.isActive,
        })),
      )
    } catch (err: any) {
      console.error(err)
      setError(err.message ?? 'Failed to close session')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-slate-500 text-sm">Loading admin dashboard…</div>
      </div>
    )
  }

  if (user?.role === 'WORKER') {
    router.navigate({ to: '/admin/queue' })
    return null
  }

  return (
    <AdminLayout user={user}>
      {errorMessage && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Sessions</h2>
            <p className="text-sm text-slate-500">
              Turn the store on and off and track sessions for analytics.
            </p>
          </div>
        </div>

        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="create-session">
            <AccordionTrigger className="text-lg font-medium">
              Create new session
            </AccordionTrigger>
            <AccordionContent>
              <form
                onSubmit={handleCreateSession}
                className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-slate-100"
              >
                <div className="flex-1 space-y-1 mt-4">
                  <Label htmlFor="new-session-name">New session name</Label>
                  <Input
                    id="new-session-name"
                    placeholder="e.g. Friday Night Event"
                    value={newSessionName}
                    onChange={(e) => setNewSessionName(e.target.value)}
                  />
                </div>
                <div className="flex items-end">
                  <Button type="submit" className="w-full sm:w-auto mt-0.5">
                    Create Session
                  </Button>
                </div>
              </form>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <div className="pt-4 border-t border-slate-100 space-y-2">
          {sessions.length === 0 ? (
            <p className="text-sm text-slate-500">
              No sessions yet. Create one to open the store.
            </p>
          ) : (
            <ul className="space-y-2">
              {sessions.map((s) => {
                return (
                  <li
                    key={s.id}
                    className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3 bg-slate-50"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span>{s.name}</span>
                        {s.isActive && (
                          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                            Active
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {s.isActive ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleClose(s.id)}
                        >
                          Close store
                        </Button>
                      ) : (
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => handleActivate(s.id)}
                        >
                          Open store
                        </Button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>
    </AdminLayout>
  )
}
