import "@testing-library/jest-dom"
import { vi } from "vitest"

// ── localStorage stub for Zustand persist middleware ──────────────────────
// Zustand's persist middleware caches the storage reference at module-init
// time, before any beforeAll() hooks run.  Override synchronously here so
// the mock is in place before any test-file imports happen.
;(() => {
  const _store: Record<string, string> = {}
  const mock: Storage = {
    getItem: (key) => _store[key] ?? null,
    setItem: (key, value) => { _store[key] = String(value) },
    removeItem: (key) => { delete _store[key] },
    clear: () => { Object.keys(_store).forEach((k) => delete _store[k]) },
    get length() { return Object.keys(_store).length },
    key: (index) => Object.keys(_store)[index] ?? null,
  }
  try {
    Object.defineProperty(globalThis, "localStorage", { value: mock, writable: true, configurable: true })
  } catch {
    // jsdom may not allow redefining localStorage — assign directly as fallback
    ;(globalThis as Record<string, unknown>)["localStorage"] = mock
  }
})()

vi.mock("@/lib/api-client", () => ({
  apiPost: vi.fn(),
  apiGet: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
  apiUpload: vi.fn(),
  apiStream: vi.fn(),
  mediaUrl: vi.fn((projectId: string, path: string) => `/api/media?projectId=${encodeURIComponent(projectId)}&path=${encodeURIComponent(path)}`),
}))

vi.mock("@/commands/fs", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  deleteFile: vi.fn(),
  listDirectory: vi.fn(),
  createDirectory: vi.fn(),
  copyFile: vi.fn(),
  copyDirectory: vi.fn(),
  preprocessFile: vi.fn(),
  findRelatedWikiPages: vi.fn(),
  createProject: vi.fn(),
  openProject: vi.fn(),
  exists: vi.fn(),
  rename: vi.fn(),
}))

vi.mock("@/i18n", () => ({
  default: {
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts) {
        return Object.entries(opts).reduce(
          (acc, [k, v]) => acc.replace(`{{${k}}}`, String(v)),
          key,
        )
      }
      return key
    },
    changeLanguage: vi.fn(),
    language: "zh",
  },
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts) {
        return Object.entries(opts).reduce(
          (acc, [k, v]) => acc.replace(`{{${k}}}`, String(v)),
          key,
        )
      }
      return key
    },
    i18n: { changeLanguage: vi.fn(), language: "zh" },
  }),
  Trans: ({ children }: { children: React.ReactNode }) => children,
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}))
