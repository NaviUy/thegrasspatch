import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { useAuthUser } from '@/hooks/useAuthUser'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/apiClient'

export const Route = createFileRoute('/admin/profile/')({
  component: RouteComponent,
})

function RouteComponent() {
  const { user, loading: authLoading, error: authError } = useAuthUser()
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (user?.name) {
      setName(user.name)
    }
  }, [user?.name])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setMessage(null)

    if (!name.trim()) {
      setError('Name is required.')
      return
    }

    try {
      setSaving(true)
      const { user: updated } = await api.updateProfile({ name: name.trim() })
      setName(updated.name)
      setMessage('Profile updated.')
    } catch (err: any) {
      console.error(err)
      setError(err.message ?? 'Failed to update profile.')
    } finally {
      setSaving(false)
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-sm text-slate-500">Loading profile…</div>
      </div>
    )
  }

  return (
    <AdminLayout user={user}>
      {(authError || error) && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">
          {authError ?? error}
        </div>
      )}
      {message && (
        <div className="rounded-md bg-emerald-50 border border-emerald-200 px-4 py-2 text-sm text-emerald-800">
          {message}
        </div>
      )}

      <div className="max-w-lg bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Profile</h1>
          <p className="text-sm text-slate-600">
            Update your display name for the admin panel.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={saving}
            />
          </div>
          <Button type="submit" disabled={saving || !name.trim()}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </form>
      </div>
    </AdminLayout>
  )
}
