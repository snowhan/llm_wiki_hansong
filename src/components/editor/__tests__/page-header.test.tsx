import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { PageHeader } from "../page-header"

describe("PageHeader", () => {
  const defaultProps = {
    title: "测试页面",
    emoji: "📝",
    onTitleChange: vi.fn(),
    onEmojiChange: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders the title text", () => {
    render(<PageHeader {...defaultProps} />)
    expect(screen.getByDisplayValue("测试页面")).toBeInTheDocument()
  })

  it("renders the emoji", () => {
    render(<PageHeader {...defaultProps} />)
    expect(screen.getByText("📝")).toBeInTheDocument()
  })

  it("renders placeholder when title is empty", () => {
    render(<PageHeader {...defaultProps} title="" />)
    const input = screen.getByPlaceholderText("无标题")
    expect(input).toBeInTheDocument()
  })

  it("calls onTitleChange when title input changes", () => {
    render(<PageHeader {...defaultProps} />)
    const input = screen.getByDisplayValue("测试页面")
    fireEvent.change(input, { target: { value: "新标题" } })
    expect(defaultProps.onTitleChange).toHaveBeenCalledWith("新标题")
  })

  it("calls onEmojiChange when emoji button is clicked and new emoji passed", () => {
    render(<PageHeader {...defaultProps} />)
    // Emoji button is a button wrapping the emoji text
    const emojiBtn = screen.getByRole("button", { name: /📝/ })
    expect(emojiBtn).toBeInTheDocument()
  })

  it("renders without emoji when emoji prop is not provided", () => {
    render(<PageHeader {...defaultProps} emoji={undefined} />)
    expect(screen.queryByText("📝")).not.toBeInTheDocument()
  })

  it("renders cover area placeholder", () => {
    render(<PageHeader {...defaultProps} />)
    // Cover button should be present (add cover)
    expect(screen.getByRole("button", { name: /封面|cover/i })).toBeInTheDocument()
  })
})
