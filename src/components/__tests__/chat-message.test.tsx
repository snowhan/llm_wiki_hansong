import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { act } from "react"
import { ChatMessage } from "../chat/chat-message"
import type { DisplayMessage } from "@/stores/chat-store"
import { useWikiStore } from "@/stores/wiki-store"

vi.mock("@/components/ui/markdown-view", () => ({
  MarkdownView: ({ content }: { content: string }) => (
    <div data-testid="md">{content}</div>
  ),
}))

beforeEach(() => {
  vi.clearAllMocks()
  useWikiStore.setState({ project: null } as any)
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  })
})

describe("ChatMessage", () => {
  it("renders user messages with the user icon", () => {
    const message: DisplayMessage = {
      id: "1",
      role: "user",
      content: "Hello wiki",
      timestamp: Date.now(),
      conversationId: "c1",
    }
    const { container } = render(<ChatMessage message={message} />)
    expect(screen.getByText("Hello wiki")).toBeInTheDocument()
    expect(container.querySelectorAll("svg").length).toBeGreaterThan(0)
  })

  it("renders assistant messages through markdown", () => {
    const message: DisplayMessage = {
      id: "2",
      role: "assistant",
      content: "## Title\nbody",
      timestamp: Date.now(),
      conversationId: "c1",
    }
    render(<ChatMessage message={message} />)
    expect(screen.getByTestId("md").textContent).toMatch(/Title/)
  })

  it("copies assistant content when copy is clicked", async () => {
    const message: DisplayMessage = {
      id: "3",
      role: "assistant",
      content: "copy me",
      timestamp: Date.now(),
      conversationId: "c1",
    }
    const { container } = render(<ChatMessage message={message} isLastAssistant />)

    const row = container.firstElementChild as HTMLElement
    fireEvent.mouseEnter(row)

    await waitFor(() => {
      expect(screen.getByText("chat.copy")).toBeInTheDocument()
    })

    await act(async () => {
      fireEvent.click(screen.getByText("chat.copy"))
    })

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("copy me")
    })
  })
})
