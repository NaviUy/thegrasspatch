import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { useAuthUser } from '@/hooks/useAuthUser'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/apiClient'

export const Route = createFileRoute('/admin/invites/')({
  component: RouteComponent,
})

const ROLES = [
  { value: 'ADMIN', label: 'Admin' },
  { value: 'WORKER', label: 'Worker' },
]

function RouteComponent() {
  const router = useRouter()
  const { user, loading: authLoading, error: authError } = useAuthUser()
  const [role, setRole] = useState<string>('WORKER')
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setCopied(false)
    try {
      setLoading(true)
      const { invite } = await api.createInvite(role)
      setInviteCode(invite.code)
    } catch (err: any) {
      console.error(err)
      setError(err.message ?? 'Failed to create invite.')
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = async () => {
    if (!inviteCode) return
    try {
      await navigator.clipboard.writeText(inviteCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error(err)
      setError('Failed to copy invite code.')
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-sm text-slate-500">Loading…</div>
      </div>
    )
  }

  if (user?.role === 'WORKER') {
    router.navigate({ to: '/admin/queue' })
    return null
  }

  return (
    <AdminLayout user={user}>
      {(authError || error) && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">
          {authError ?? error}
        </div>
      )}

      <div className="max-w-lg bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            Invite team member
          </h1>
          <p className="text-sm text-slate-600">
            Generate a one-time invite code for an Admin or Worker.
          </p>
        </div>

        <form className="space-y-3" onSubmit={handleGenerate}>
          <div className="space-y-1.5">
            <Label htmlFor="role">Role</Label>
            <select
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <Button type="submit" disabled={loading}>
            {loading ? 'Generating…' : 'Generate invite'}
          </Button>
        </form>

        {inviteCode && (
          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-sm text-slate-700">
              Invite code for {role === 'ADMIN' ? 'Admin' : 'Worker'}:
            </p>
            <div className="flex items-center gap-2">
              <code className="px-3 py-2 rounded-md bg-white border border-slate-200 text-sm">
                {inviteCode}
              </code>
              <Button size="sm" variant="outline" onClick={handleCopy}>
                {copied ? 'Copied!' : 'Copy'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
