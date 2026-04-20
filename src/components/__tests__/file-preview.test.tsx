import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { mediaUrl } from "@/lib/api-client"
import { FilePreview } from "../editor/file-preview"

const mockOnWikilinkClick = vi.fn()

vi.mock("@/hooks/use-wikilink-navigation", () => ({
  useWikilinkNavigation: () => mockOnWikilinkClick,
}))

const capturedMarkdownProps: Array<Record<string, any>> = []

vi.mock("../ui/markdown-view", () => ({
  MarkdownView: (props: Record<string, any>) => {
    capturedMarkdownProps.push(props)
    return <div data-testid="markdown">{props.markdown}</div>
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  capturedMarkdownProps.length = 0
})

describe("FilePreview", () => {
  it("renders an img for image files", () => {
    render(<FilePreview projectId="proj-1" filePath="raw/sources/photo.png" textContent="" />)
    const img = screen.getByRole("img", { name: "photo.png" })
    expect(img.getAttribute("src")).toBe(mediaUrl("proj-1", "raw/sources/photo.png"))
  })

  it("renders MarkdownView for plain text files", () => {
    render(<FilePreview projectId="proj-1" filePath="raw/sources/readme.txt" textContent="# Hello" />)
    expect(screen.getByTestId("markdown")).toBeTruthy()
    expect(screen.getByText("preview.text")).toBeTruthy()
  })

  it("passes onWikilinkClick from useWikilinkNavigation to MarkdownView for text files", () => {
    render(<FilePreview projectId="proj-1" filePath="raw/sources/readme.txt" textContent="# Hello" />)
    expect(capturedMarkdownProps.length).toBeGreaterThan(0)
    expect(capturedMarkdownProps[0].onWikilinkClick).toBe(mockOnWikilinkClick)
  })

  it("passes onWikilinkClick to MarkdownView for PDF text content", () => {
    render(<FilePreview projectId="proj-1" filePath="raw/sources/report.pdf" textContent="content" />)
    expect(capturedMarkdownProps.length).toBeGreaterThan(0)
    expect(capturedMarkdownProps[0].onWikilinkClick).toBe(mockOnWikilinkClick)
  })

  it("shows placeholder for unknown binary extensions", () => {
    render(<FilePreview projectId="proj-1" filePath="raw/sources/data.bin" textContent="" />)
    expect(screen.getByText("preview.notAvailable")).toBeTruthy()
    expect(screen.getByText("data.bin")).toBeTruthy()
  })

  it("does not render MarkdownView for image files", () => {
    capturedMarkdownProps.length = 0
    render(<FilePreview projectId="proj-1" filePath="raw/sources/photo.png" textContent="" />)
    expect(capturedMarkdownProps.length).toBe(0)
  })
})
