import { setAuthToken } from '@/lib/apiClient'
import { useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { api } from '@/lib/apiClient'

type UseAuthUserOptions = {
  redirectToLogin?: boolean
}

export function useAuthUser(options: UseAuthUserOptions = {}) {
  const { redirectToLogin = true } = options
  const router = useRouter()

  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await api.me()
        if (cancelled) return
        setUser(res.user)
      } catch (error: any) {
        if (cancelled) return
        console.error('Auth check error: ', error)
        setError(error.message ?? 'Not authenticated')

        if (redirectToLogin) {
          setAuthToken(null)
          router.navigate({ to: '/admin/login' })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [redirectToLogin, router])

  return { user, loading, error }
}
