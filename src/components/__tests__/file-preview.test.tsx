import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { convertFileSrc } from "@tauri-apps/api/core"
import { FilePreview } from "../editor/file-preview"

vi.mock("../ui/markdown-view", () => ({
  MarkdownView: ({ children, content }: { children?: React.ReactNode; content?: string }) => (
    <div data-testid="markdown">{content ?? children}</div>
  ),
}))

describe("FilePreview", () => {
  it("renders an img for image files", () => {
    render(<FilePreview filePath="/tmp/photo.png" textContent="" />)
    const img = screen.getByRole("img", { name: "photo.png" })
    expect(img.getAttribute("src")).toBe(convertFileSrc("/tmp/photo.png"))
  })

  it("renders MarkdownView for plain text files", () => {
    render(<FilePreview filePath="/tmp/readme.txt" textContent="# Hello" />)
    expect(screen.getByTestId("markdown")).toBeTruthy()
    expect(screen.getByText("preview.text")).toBeTruthy()
  })

  it("shows placeholder for unknown binary extensions", () => {
    render(<FilePreview filePath="/tmp/data.bin" textContent="" />)
    expect(screen.getByText("preview.notAvailable")).toBeTruthy()
    expect(screen.getByText("data.bin")).toBeTruthy()
  })
})
