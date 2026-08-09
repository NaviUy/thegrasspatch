const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

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
    let data: any = null
    try {
      data = await res.json()
    } catch {}
    if (data?.error) message = data.error
    const error: any = new Error(message)
    error.status = res.status
    error.data = data
    throw error
  }

  return res.json()
}

async function download(path: string, filename: string) {
  const token = getAuthToken()
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
  if (!res.ok) {
    let message = `Download failed with ${res.status}`
    try {
      const data = await res.json()
      if (data?.error) message = data.error
    } catch {}
    throw new Error(message)
  }
  const url = URL.createObjectURL(await res.blob())
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
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
  listSessions: () => request<{ sessions: Array<any> }>('/api/sessions'),
  getSessionAnalytics: (sessionId: string) =>
    request<{ analytics: any }>(
      `/api/analytics/sessions/${encodeURIComponent(sessionId)}/summary`,
    ),
  downloadSessionAnalyticsCsv: (sessionId: string, filename: string) =>
    download(
      `/api/analytics/sessions/${encodeURIComponent(sessionId)}.csv`,
      filename,
    ),
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
  getActiveInventory: () =>
    request<{ session: any; items: Array<any> }>('/api/inventory/active'),
  updateActiveInventory: (
    menuItemId: string,
    updates: { inventoryLimit?: number | null; isSoldOut?: boolean },
  ) =>
    request<{ sessionId: string; item: any }>(
      `/api/inventory/active/${menuItemId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(updates),
      },
    ),
  createInvite: (role: string) =>
    request<{ invite: any }>('/api/invites', {
      method: 'POST',
      body: JSON.stringify({ role }),
    }),
  listMenuItems: () => request<{ items: Array<any> }>('/api/menu-items'),
  createMenuItem: (input: {
    name: string
    priceCents: number
    imageUrl?: string
    imagePlaceholderUrl?: string
    badges?: Array<{ label: string; color?: string }>
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
      imageUrl?: string | null
      imagePlaceholderUrl?: string | null
      badges?: Array<{ label: string; color?: string }>
      isActive: boolean
      options: Array<any>
    }>,
  ) =>
    request<{ item: any }>(`/api/menu-items/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),
  updateActiveOptionInventory: (
    optionChoiceId: string,
    updates: { inventoryLimit?: number | null; isSoldOut?: boolean },
  ) =>
    request<{ ok: true }>(`/api/inventory/active/options/${optionChoiceId}`, {
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
  getPublicMenuItems: () =>
    request<{ items: Array<any> }>('/api/public/menu-items'),
  refreshPublicCart: (items: Array<any>) =>
    request<{
      active: Array<any>
      removed: Array<any>
      adjusted: Array<any>
    }>('/api/public/cart/refresh', {
      method: 'POST',
      body: JSON.stringify({ items }),
    }),
  createPublicOrder: (input: {
    customerName: string
    customerPhone?: string | null
    smsOptIn: boolean
    items: Array<{
      cartLineId: string
      menuItemId: string
      quantity: number
      name?: string
      selectedOptionChoiceIds?: Array<string>
      specialInstructions?: string
    }>
  }) =>
    request<{
      order: any
      removed: Array<any>
      adjusted: Array<any>
      trackingJwt: string
    }>('/api/public/orders', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  getPublicOrder: (id: string) =>
    request<{ order: any; trackingJwt: string }>(`/api/public/orders/${id}`),
  listActiveOrders: (status?: 'PENDING' | 'MAKING' | 'READY' | 'ALL') => {
    const query =
      status && status !== 'ALL' ? `?status=${encodeURIComponent(status)}` : ''
    return request<{ orders: Array<any> }>(`/api/orders/active${query}`)
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
  health: () => request<{ ok: boolean }>('/api/health'),
  reorderMenuItems: (ids: Array<string>) =>
    request<{ items: Array<any> }>('/api/menu-items/reorder', {
      method: 'POST',
      body: JSON.stringify({ ids }),
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
