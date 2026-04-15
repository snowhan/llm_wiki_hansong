import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { WikiEditor } from "../editor/wiki-editor"

const useEditorMock = vi.fn()

vi.mock("@milkdown/react", () => ({
  MilkdownProvider: ({ children }: { children?: unknown }) => (
    <div data-testid="milkdown-provider">{children}</div>
  ),
  Milkdown: () => <div data-testid="milkdown" />,
  useEditor: (...args: unknown[]) => useEditorMock(...args),
}))

vi.mock("@milkdown/kit/core", () => {
  const chain = {
    config: vi.fn().mockReturnThis(),
    use: vi.fn().mockReturnThis(),
  }
  return {
    Editor: { make: () => chain },
    rootCtx: {},
    defaultValueCtx: {},
  }
})

vi.mock("@milkdown/kit/preset/commonmark", () => ({
  commonmark: {},
}))

vi.mock("@milkdown/kit/preset/gfm", () => ({
  gfm: {},
}))

vi.mock("@milkdown/kit/plugin/history", () => ({
  history: {},
}))

vi.mock("@milkdown/kit/plugin/listener", () => ({
  listener: {},
  listenerCtx: {},
}))

vi.mock("@milkdown/plugin-math", () => ({
  math: {},
}))

vi.mock("@milkdown/theme-nord", () => ({
  nord: {},
}))

beforeEach(() => {
  useEditorMock.mockClear()
})

describe("WikiEditor", () => {
  it("renders the milkdown container", () => {
    const onSave = vi.fn()
    render(<WikiEditor content="# Hello" onSave={onSave} />)
    expect(screen.getByTestId("milkdown-provider")).toBeInTheDocument()
    expect(screen.getByTestId("milkdown")).toBeInTheDocument()
  })

  it("passes content into the editor hook", () => {
    const onSave = vi.fn()
    render(<WikiEditor content="unique-body" onSave={onSave} />)
    expect(useEditorMock).toHaveBeenCalled()
    const deps = useEditorMock.mock.calls[0][1] as unknown[]
    expect(deps).toContain("unique-body")
  })
})
