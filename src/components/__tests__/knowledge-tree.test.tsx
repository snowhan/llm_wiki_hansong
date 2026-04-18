import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { KnowledgeTree } from "../layout/knowledge-tree"
import { useWikiStore } from "@/stores/wiki-store"
import { listDirectory, readFile } from "@/commands/fs"

describe("KnowledgeTree", () => {
  beforeEach(() => {
    useWikiStore.setState({
      project: null,
      fileTree: [],
      selectedFile: null,
      fileContent: "",
      activeView: "wiki",
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
      searchApiConfig: { provider: "none", apiKey: "" },
      embeddingConfig: { enabled: false, endpoint: "", apiKey: "", model: "" },
    } as any)
    vi.mocked(listDirectory).mockReset()
    vi.mocked(readFile).mockReset()
  })

  it("no project shows empty state", () => {
    render(<KnowledgeTree />)
    expect(screen.getByText("knowledgeTree.noProject")).toBeTruthy()
  })

  it("loads pages and groups by type", async () => {
    useWikiStore.setState({
      project: { id: "demo-uuid", name: "Demo", path: "/projects/demo" },
      fileTree: [],
    } as any)
    vi.mocked(listDirectory).mockImplementation(async (_projectId: string, dir?: string) => {
      if (dir === "wiki" || dir?.endsWith("/wiki")) {
        return [
          {
            name: "entities",
            relativePath: "wiki/entities",
            is_dir: true,
            children: [
              {
                name: "alpha.md",
                relativePath: "wiki/entities/alpha.md",
                is_dir: false,
              },
            ],
          },
        ]
      }
      return []
    })
    vi.mocked(readFile).mockResolvedValue(
      "---\ntype: entity\ntitle: Alpha Page\n---\n\n# Alpha Page\n",
    )
    render(<KnowledgeTree />)
    await waitFor(() => {
      expect(screen.getByText("knowledgeTree.entities")).toBeTruthy()
    })
    expect(screen.getByText("Alpha Page")).toBeTruthy()
  })

  it("click page calls setSelectedFile", async () => {
    useWikiStore.setState({
      project: { id: "demo-uuid", name: "Demo", path: "/projects/demo" },
      fileTree: [],
      selectedFile: null,
    } as any)
    vi.mocked(listDirectory).mockImplementation(async (_projectId: string, dir?: string) => {
      if (dir === "wiki" || dir?.endsWith("/wiki")) {
        return [
          {
            name: "concepts",
            relativePath: "wiki/concepts",
            is_dir: true,
            children: [
              {
                name: "beta.md",
                relativePath: "wiki/concepts/beta.md",
                is_dir: false,
              },
            ],
          },
        ]
      }
      return []
    })
    vi.mocked(readFile).mockResolvedValue(
      "---\ntype: concept\ntitle: Beta Page\n---\n",
    )
    render(<KnowledgeTree />)
    await waitFor(() => {
      expect(screen.getByText("Beta Page")).toBeTruthy()
    })
    fireEvent.click(screen.getByText("Beta Page"))
    expect(useWikiStore.getState().selectedFile).toBe("wiki/concepts/beta.md")
  })
})
