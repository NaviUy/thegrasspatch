import { createFileRoute, Link, useRouter, redirect } from '@tanstack/react-router'
import { useState } from 'react'
import { api, setAuthToken } from '../../../lib/apiClient'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export const Route = createFileRoute('/admin/login/')({
  loader: async () => {
    try {
      await api.me()
      throw redirect({ to: '/admin' })
    } catch (err: any) {
      const status = err?.status
      if (status === 401 || status === 403) {
        return null
      }
      throw err
    }
  },
  pendingComponent: () => null,
  component: AdminLoginPage,
})

function AdminLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const result = await api.login(email, password)
      setAuthToken(result.token)
      router.navigate({ to: '/admin' })
    } catch (error: any) {
      setError(error.message ?? 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-full max-w-md bg-white rounded-xl shadow p-8 space-y-6 mx-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold text-slate-900">Admin Login</h1>
          <Button variant="outline" size="sm" asChild>
            <Link to="/">Back to home</Link>
          </Button>
        </div>
        <p className="text-sm text-slate-500">
          Sign in to manage sessions and orders.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            ></Input>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          {error && <div className="text-sm text-red-600">{error}</div>}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
        <p className="text-xs text-slate-400">
          Need access? Ask the owner/admin for an invite code to{' '}
          <Link to="/admin/signup" className="text-blue-500">
            sign up
          </Link>
          .
        </p>
      </div>
    </section>
  )
}
