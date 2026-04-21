import { create } from "zustand"

export type UserRole = "member" | "admin"

export interface AuthUser {
  id: string
  username: string
  role: UserRole
  status: string
  createdAt: string
  updatedAt: string
}

interface AuthState {
  user: AuthUser | null
  accessToken: string | null
  isInitializing: boolean

  initialize: () => Promise<void>
  login: (username: string, password: string) => Promise<void>
  register: (username: string, password: string) => Promise<{ isPending: boolean }>
  logout: () => Promise<void>
  refreshToken: () => Promise<boolean>
  setTokenAndUser: (token: string, user: AuthUser) => void
  clearAuth: () => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  isInitializing: true,

  initialize: async () => {
    set({ isInitializing: true })
    try {
      const ok = await get().refreshToken()
      if (!ok) {
        set({ user: null, accessToken: null })
      }
    } catch {
      set({ user: null, accessToken: null })
    } finally {
      set({ isInitializing: false })
    }
  },

  login: async (username: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ username, password }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Login failed" }))
      throw new Error(body.error ?? `HTTP ${res.status}`)
    }
    const data = await res.json() as { user: AuthUser; accessToken: string }
    set({ user: data.user, accessToken: data.accessToken })
  },

  register: async (username: string, password: string) => {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Registration failed" }))
      throw new Error(body.error ?? `HTTP ${res.status}`)
    }
    const data = await res.json() as { user: { status: string } }
    return { isPending: data.user.status === "pending" }
  },

  logout: async () => {
    const { accessToken } = get()
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
        credentials: "include",
      })
    } catch {
      // ignore network errors on logout
    }
    set({ user: null, accessToken: null })
  },

  refreshToken: async (): Promise<boolean> => {
    try {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "include",
      })
      if (res.status === 204) return false // no session cookie present
      if (!res.ok) return false
      const data = await res.json() as { accessToken: string }

      // Get current user info with the new token
      const meRes = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${data.accessToken}` },
      })
      if (!meRes.ok) return false
      const user = await meRes.json() as AuthUser

      set({ user, accessToken: data.accessToken })
      return true
    } catch {
      return false
    }
  },

  setTokenAndUser: (token: string, user: AuthUser) => {
    set({ user, accessToken: token })
  },

  clearAuth: () => {
    set({ user: null, accessToken: null })
  },
}))
