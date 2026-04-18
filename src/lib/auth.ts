const TOKEN_KEY = "llm-wiki-access-token"

export function getStoredToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? ""
  } catch {
    return ""
  }
}

export function setStoredToken(token: string): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token)
    } else {
      localStorage.removeItem(TOKEN_KEY)
    }
  } catch {
    // ignore localStorage errors
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    // ignore
  }
}
