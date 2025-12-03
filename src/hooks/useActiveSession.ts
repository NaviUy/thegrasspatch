import { useState, useEffect } from 'react'
import { api } from '@/lib/apiClient'

type PublicSession = {
  id: string
  name: string
}

type UseActiveSessionResult = {
  loading: boolean
  error: string | null
  open: boolean
  session: PublicSession | null
}

export function useActiveSession(): UseActiveSessionResult {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [session, setSession] = useState<PublicSession | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const { open, session } = await api.getPublicActiveSession()
        if (cancelled) return
        setOpen(open)
        setSession(session)
      } catch (err: any) {
        console.error(err)
        if (cancelled) return
        const msg = (err?.message ?? '').toLowerCase()
        const noActive =
          msg.includes('no active session') ||
          msg.includes('active session not found') ||
          msg.includes('failed to fetch active session')
        if (noActive) {
          setError(null)
        } else {
          setError(err?.message ?? 'Failed to check store status')
        }
        setOpen(false)
        setSession(null)
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  return { loading, error, open, session }
}
