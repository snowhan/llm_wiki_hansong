import "@testing-library/jest-dom"
import { vi } from "vitest"

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  convertFileSrc: vi.fn((src: string) => `asset://localhost/${src}`),
}))

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
  save: vi.fn(),
  message: vi.fn(),
  ask: vi.fn(),
  confirm: vi.fn(),
}))

vi.mock("@tauri-apps/plugin-store", () => {
  const storeData = new Map<string, unknown>()
  return {
    load: vi.fn().mockResolvedValue({
      get: vi.fn((key: string) => Promise.resolve(storeData.get(key))),
      set: vi.fn((key: string, value: unknown) => {
        storeData.set(key, value)
        return Promise.resolve()
      }),
      delete: vi.fn((key: string) => {
        storeData.delete(key)
        return Promise.resolve()
      }),
      clear: vi.fn(() => {
        storeData.clear()
        return Promise.resolve()
      }),
    }),
  }
})

vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: vi.fn(),
}))

vi.mock("@/commands/fs", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  deleteFile: vi.fn(),
  listDirectory: vi.fn(),
  createDirectory: vi.fn(),
  exists: vi.fn(),
  rename: vi.fn(),
  clipServerStatus: vi.fn().mockResolvedValue("running"),
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
