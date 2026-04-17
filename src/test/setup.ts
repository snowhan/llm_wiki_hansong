import "@testing-library/jest-dom"
import { vi } from "vitest"

vi.mock("@/lib/api-client", () => ({
  apiPost: vi.fn(),
  apiGet: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
  apiUpload: vi.fn(),
  apiStream: vi.fn(),
  mediaUrl: vi.fn((path: string) => `/api/media?path=${encodeURIComponent(path)}`),
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
  clipServerStatus: vi.fn().mockResolvedValue("running"),
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
