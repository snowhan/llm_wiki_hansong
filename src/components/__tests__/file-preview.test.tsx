import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { mediaUrl } from "@/lib/api-client"
import { FilePreview } from "../editor/file-preview"

vi.mock("../ui/markdown-view", () => ({
  MarkdownView: ({ children, markdown }: { children?: React.ReactNode; markdown?: string }) => (
    <div data-testid="markdown">{markdown ?? children}</div>
  ),
}))

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

  it("shows placeholder for unknown binary extensions", () => {
    render(<FilePreview projectId="proj-1" filePath="raw/sources/data.bin" textContent="" />)
    expect(screen.getByText("preview.notAvailable")).toBeTruthy()
    expect(screen.getByText("data.bin")).toBeTruthy()
  })
})
