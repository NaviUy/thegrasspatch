const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'

export function getAuthToken() {
  return localStorage.getItem('auth_token')
}

export function setAuthToken(token: string | null) {
  if (!token) {
    localStorage.removeItem('auth_token')
  } else {
    localStorage.setItem('auth_token', token)
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken()
  const headers = new Headers(options.headers || {})

  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  })

  if (!res.ok) {
    let message = `Request failed with ${res.status}`
    try {
      const data = await res.json()
      if (data?.error) message = data.error
    } catch {}
    const error: any = new Error(message)
    error.status = res.status
    throw error
  }

  return res.json()
}

export const api = {
  login: (email: string, password: string) => {
    return request<{ token: string; user: any }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
  },
  signup: (email: string, password: string, inviteCode: string) => {
    return request<{ token: string; user: any }>('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, inviteCode }),
    })
  },
  signupWithName: (input: {
    name: string
    email: string
    password: string
    inviteCode: string
  }) =>
    request<{ token: string; user: any }>('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  me: () => request<{ user: any }>('/api/auth/me'),
  updateProfile: (input: { name: string }) =>
    request<{ user: any }>('/api/auth/me', {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  listSessions: () => request<{ sessions: any[] }>('/api/sessions'),
  createSession: (name: string) =>
    request<{ session: any }>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  activateSession: (id: string) =>
    request<{ session: any }>(`/api/sessions/${id}/activate`, {
      method: 'POST',
    }),
  closeSession: (id: string) =>
    request<{ session: any }>(`/api/sessions/${id}/close`, {
      method: 'POST',
    }),
  createInvite: (role: string) =>
    request<{ invite: any }>('/api/invites', {
      method: 'POST',
      body: JSON.stringify({ role }),
    }),
  listMenuItems: () => request<{ items: any[] }>('/api/menu-items'),
  createMenuItem: (input: {
    name: string
    priceCents: number
    imageUrl?: string
    isActive: boolean
  }) =>
    request<{ item: any }>('/api/menu-items', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateMenuItem: (
    id: string,
    updates: Partial<{
      name: string
      priceCents: number
      imageUrl?: string
      isActive: boolean
    }>,
  ) =>
    request<{ item: any }>(`/api/menu-items/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),
  deleteMenuItem: (id: string) =>
    request<{ item: any }>(`/api/menu-items/${id}`, {
      method: 'DELETE',
    }),
  getPublicActiveSession: () =>
    request<{ open: boolean; session: any | null }>(
      '/api/public/active-session',
    ),
  getPublicMenuItems: () => request<{ items: any[] }>('/api/public/menu-items'),
  refreshPublicCart: (items: any[]) =>
    request<{ active: any[]; removed: any[] }>('/api/public/cart/refresh', {
      method: 'POST',
      body: JSON.stringify({ items }),
    }),
  createPublicOrder: (input: {
    customerName: string
    customerPhone?: string | null
    items: Array<{ menuItemId: string; quantity: number; name?: string }>
  }) =>
    request<{ order: any; removed: any[] }>('/api/public/orders', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  getPublicOrder: (id: string) =>
    request<{ order: any }>(`/api/public/orders/${id}`),
  listActiveOrders: (status?: 'PENDING' | 'MAKING' | 'READY' | 'ALL') => {
    const query =
      status && status !== 'ALL' ? `?status=${encodeURIComponent(status)}` : ''
    return request<{ orders: any[] }>(`/api/orders/active${query}`)
  },
  assignOrderToMe: (orderId: string) =>
    request<{ order: any }>(`/api/orders/${orderId}/assign`, {
      method: 'POST',
    }),
  unassignOrder: (orderId: string) =>
    request<{ order: any }>(`/api/orders/${orderId}/unassign`, {
      method: 'POST',
    }),
  updateOrderStatus: (orderId: string, status: string) =>
    request<{ order: any }>(`/api/orders/${orderId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
  uploadMenuImage: async (file: File) => {
    const token = getAuthToken()
    const formData = new FormData()
    formData.append('file', file)

    const res = await fetch(`${API_BASE_URL}/api/uploads/menu-image`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: formData,
    })

    if (!res.ok) {
      let message = `Upload failed with ${res.status}`
      try {
        const data = await res.json()
        if (data?.error) message = data.error
      } catch {}
      throw new Error(message)
    }

    return res.json() as Promise<{ publicUrl: string; placeholderUrl: string }>
  },
}
