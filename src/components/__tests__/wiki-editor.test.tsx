import { describe, it, expect, vi, beforeEach } from "vitest"
import { render } from "@testing-library/react"
import { WikiEditor } from "../editor/wiki-editor"

const destroyMock = vi.fn()
const setThemeMock = vi.fn()

vi.mock("vditor", () => {
  const Vditor = vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.destroy = destroyMock
    this.setTheme = setThemeMock
    this.getValue = vi.fn().mockReturnValue("")
  })
  return { default: Vditor }
})

vi.mock("@/hooks/use-is-dark", () => ({
  useIsDark: () => false,
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe("WikiEditor", () => {
  it("renders the vditor container element", () => {
    const onSave = vi.fn()
    const { container } = render(<WikiEditor content="# Hello" onSave={onSave} />)
    expect(container.querySelector(".vditor-editor-wrap")).toBeTruthy()
  })

  it("initializes Vditor with the provided content", async () => {
    const { default: VditorMock } = await import("vditor")
    const onSave = vi.fn()
    render(<WikiEditor content="unique-body" onSave={onSave} />)
    expect(VditorMock).toHaveBeenCalled()
    const initOptions = (VditorMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1]
    expect(initOptions.value).toBe("unique-body")
    expect(initOptions.mode).toBe("ir")
  })

  it("destroys Vditor on unmount", () => {
    const onSave = vi.fn()
    const { unmount } = render(<WikiEditor content="test" onSave={onSave} />)
    unmount()
    expect(destroyMock).toHaveBeenCalled()
  })
})
