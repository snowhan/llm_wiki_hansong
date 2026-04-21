/**
 * Auth token accessor — reads from the in-memory Zustand auth store.
 * Access tokens are never stored in localStorage to prevent XSS theft.
 * Refresh tokens are stored in httpOnly cookies by the server.
 */
import { useAuthStore } from "@/stores/auth-store"

export function getStoredToken(): string {
  return useAuthStore.getState().accessToken ?? ""
}

/** @deprecated No-op: tokens are now managed by the auth store, not localStorage */
export function setStoredToken(_token: string): void {
  // Token is managed by auth-store, this is a no-op kept for compatibility
}

/** @deprecated Use useAuthStore().logout() instead */
export function clearToken(): void {
  useAuthStore.getState().clearAuth()
}
