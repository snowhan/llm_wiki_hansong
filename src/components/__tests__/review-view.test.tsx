import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { ReviewView } from "../review/review-view"
import { useReviewStore } from "@/stores/review-store"
import { useWikiStore } from "@/stores/wiki-store"
import { queueResearch } from "@/lib/deep-research"

vi.mock("@/lib/deep-research", () => ({
  queueResearch: vi.fn(),
}))

describe("ReviewView", () => {
  beforeEach(() => {
    useWikiStore.setState({
      project: { name: "P", path: "/proj" },
      fileTree: [],
      selectedFile: null,
      fileContent: "",
      activeView: "review",
      chatExpanded: false,
      dataVersion: 0,
      llmConfig: {
        provider: "openai",
        apiKey: "",
        model: "",
        ollamaUrl: "http://localhost:11434",
        customEndpoint: "",
        maxContextSize: 204800,
      },
      searchApiConfig: { provider: "tavily", apiKey: "k" },
      embeddingConfig: { enabled: false, endpoint: "", apiKey: "", model: "" },
    } as any)
    useReviewStore.setState({ items: [] })
  })

  it("empty state when no items", () => {
    render(<ReviewView />)
    expect(screen.getByText("review.allClear")).toBeTruthy()
  })

  it("renders review cards for items", () => {
    useReviewStore.setState({
      items: [
        {
          id: "i1",
          type: "confirm",
          title: "Check this",
          description: "Body text",
          options: [{ label: "lint.skip", action: "Skip" }],
          resolved: false,
          createdAt: 1,
        },
      ],
    } as any)
    render(<ReviewView />)
    expect(screen.getByText("Check this")).toBeTruthy()
    expect(screen.getByText("Body text")).toBeTruthy()
  })

  it("clear resolved button works", () => {
    useReviewStore.setState({
      items: [
        {
          id: "a",
          type: "confirm",
          title: "Open",
          description: "d",
          options: [],
          resolved: true,
          resolvedAction: "done",
          createdAt: 1,
        },
        {
          id: "b",
          type: "confirm",
          title: "Pending",
          description: "d",
          options: [],
          resolved: false,
          createdAt: 2,
        },
      ],
    } as any)
    render(<ReviewView />)
    fireEvent.click(screen.getByText("review.clearResolved"))
    expect(useReviewStore.getState().items.map((i) => i.id)).toEqual(["b"])
    expect(queueResearch).not.toHaveBeenCalled()
  })
})
