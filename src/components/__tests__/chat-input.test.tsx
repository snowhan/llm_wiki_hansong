import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { ChatInput } from "../chat/chat-input"

describe("ChatInput", () => {
  const defaultProps = {
    onSend: vi.fn(),
    onStop: vi.fn(),
    isStreaming: false,
  }

  it("renders textarea and send button", () => {
    render(<ChatInput {...defaultProps} />)
    expect(screen.getByRole("textbox")).toBeTruthy()
    expect(screen.getByTitle("chat.sendMessage")).toBeTruthy()
  })

  it("uses custom placeholder", () => {
    render(<ChatInput {...defaultProps} placeholder="Ask anything..." />)
    expect(screen.getByPlaceholderText("Ask anything...")).toBeTruthy()
  })

  it("send button is disabled when textarea is empty", () => {
    render(<ChatInput {...defaultProps} />)
    const sendBtn = screen.getByTitle("chat.sendMessage")
    expect(sendBtn).toBeDisabled()
  })

  it("calls onSend when clicking send with text", async () => {
    const onSend = vi.fn()
    render(<ChatInput {...defaultProps} onSend={onSend} />)
    const textarea = screen.getByRole("textbox")
    fireEvent.change(textarea, { target: { value: "hello" } })
    const sendBtn = screen.getByTitle("chat.sendMessage")
    fireEvent.click(sendBtn)
    expect(onSend).toHaveBeenCalledWith("hello")
  })

  it("clears input after sending", async () => {
    render(<ChatInput {...defaultProps} />)
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: "hello" } })
    const sendBtn = screen.getByTitle("chat.sendMessage")
    fireEvent.click(sendBtn)
    expect(textarea.value).toBe("")
  })

  it("calls onSend on Enter key", () => {
    const onSend = vi.fn()
    render(<ChatInput {...defaultProps} onSend={onSend} />)
    const textarea = screen.getByRole("textbox")
    fireEvent.change(textarea, { target: { value: "hello" } })
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false })
    expect(onSend).toHaveBeenCalledWith("hello")
  })

  it("does not send on Shift+Enter", () => {
    const onSend = vi.fn()
    render(<ChatInput {...defaultProps} onSend={onSend} />)
    const textarea = screen.getByRole("textbox")
    fireEvent.change(textarea, { target: { value: "hello" } })
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true })
    expect(onSend).not.toHaveBeenCalled()
  })

  it("shows stop button when streaming", () => {
    render(<ChatInput {...defaultProps} isStreaming={true} />)
    expect(screen.getByTitle("chat.stopGeneration")).toBeTruthy()
  })

  it("disables textarea when streaming", () => {
    render(<ChatInput {...defaultProps} isStreaming={true} />)
    expect(screen.getByRole("textbox")).toBeDisabled()
  })

  it("calls onStop when clicking stop button", () => {
    const onStop = vi.fn()
    render(<ChatInput {...defaultProps} onStop={onStop} isStreaming={true} />)
    fireEvent.click(screen.getByTitle("chat.stopGeneration"))
    expect(onStop).toHaveBeenCalled()
  })

  it("does not call onSend with only whitespace", () => {
    const onSend = vi.fn()
    render(<ChatInput {...defaultProps} onSend={onSend} />)
    const textarea = screen.getByRole("textbox")
    fireEvent.change(textarea, { target: { value: "   " } })
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false })
    expect(onSend).not.toHaveBeenCalled()
  })
})
