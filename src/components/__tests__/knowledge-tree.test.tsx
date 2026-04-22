import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react"
import { KnowledgeTree } from "../layout/knowledge-tree"
import { useWikiStore } from "@/stores/wiki-store"
import { listDirectory, readFile, writeFile } from "@/commands/fs"

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

  it("T-009: shows TreeSkeleton while pages are loading (project set but no pages yet)", async () => {    useWikiStore.setState({
      project: { id: "demo-uuid", name: "Demo", path: "/projects/demo" },
      fileTree: [],
    } as any)
    // Make listDirectory hang to simulate loading
    let resolve: (v: unknown[]) => void
    vi.mocked(listDirectory).mockImplementation(() => new Promise((r) => { resolve = r }))

    render(<KnowledgeTree />)
    // While loading, skeleton should be visible
    expect(document.querySelector(".MuiSkeleton-root")).toBeTruthy()
    // Resolve to stop loading
    resolve!([])
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

  it("uses activeTabPath (not stale selectedFile) for selected page marker", async () => {
    useWikiStore.setState({
      project: { id: "demo-uuid", name: "Demo", path: "/projects/demo" },
      fileTree: [],
      selectedFile: "wiki/sources/legacy.md",
      activeTabPath: "wiki/concepts/beta.md",
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
    vi.mocked(readFile).mockResolvedValue("---\ntype: concept\ntitle: Beta Page\n---\n")

    render(<KnowledgeTree />)
    const beta = await screen.findByText("Beta Page")
    const selectedBtn = beta.closest("button")
    expect(selectedBtn?.getAttribute("aria-current")).toBe("page")
  })

  it("opens the correct raw source path when duplicate filenames exist", async () => {
    useWikiStore.setState({
      project: { id: "demo-uuid", name: "Demo", path: "/projects/demo" },
      fileTree: [],
      selectedFile: null,
      activeTabPath: null,
      openTabs: [],
      activeTabId: null,
    } as any)
    vi.mocked(listDirectory).mockImplementation(async (_projectId: string, dir?: string) => {
      if (dir === "wiki" || dir?.endsWith("/wiki")) return []
      if (dir === "raw/sources") {
        return [
          {
            name: "folder-a",
            relativePath: "raw/sources/folder-a",
            is_dir: true,
            children: [
              { name: "same.pdf", relativePath: "raw/sources/folder-a/same.pdf", is_dir: false },
            ],
          },
          {
            name: "folder-b",
            relativePath: "raw/sources/folder-b",
            is_dir: true,
            children: [
              { name: "same.pdf", relativePath: "raw/sources/folder-b/same.pdf", is_dir: false },
            ],
          },
        ]
      }
      return []
    })
    vi.mocked(readFile).mockResolvedValue("")

    render(<KnowledgeTree />)
    fireEvent.click(await screen.findByText("knowledgeTree.rawSources"))
    const dupButtons = await screen.findAllByText("same.pdf")
    fireEvent.click(dupButtons[1])

    expect(useWikiStore.getState().activeTabPath).toBe("raw/sources/folder-b/same.pdf")
  })

  it("replay state: stale selectedFile does not override activeTabPath highlight", async () => {
    useWikiStore.setState({
      project: { id: "demo-uuid", name: "Demo", path: "/projects/demo" },
      fileTree: [],
      selectedFile: "wiki/concepts/old.md",
      activeTabPath: "wiki/concepts/new.md",
    } as any)
    vi.mocked(listDirectory).mockImplementation(async (_projectId: string, dir?: string) => {
      if (dir === "wiki" || dir?.endsWith("/wiki")) {
        return [
          {
            name: "concepts",
            relativePath: "wiki/concepts",
            is_dir: true,
            children: [
              { name: "old.md", relativePath: "wiki/concepts/old.md", is_dir: false },
              { name: "new.md", relativePath: "wiki/concepts/new.md", is_dir: false },
            ],
          },
        ]
      }
      return []
    })
    vi.mocked(readFile).mockImplementation(async (_projectId: string, relativePath: string) => {
      if (relativePath.endsWith("old.md")) return "---\ntype: concept\ntitle: Old Concept\n---\n"
      return "---\ntype: concept\ntitle: New Concept\n---\n"
    })

    render(<KnowledgeTree />)
    const oldBtn = (await screen.findByText("Old Concept")).closest("button")
    const newBtn = screen.getByText("New Concept").closest("button")

    expect(oldBtn?.getAttribute("aria-current")).toBeNull()
    expect(newBtn?.getAttribute("aria-current")).toBe("page")
  })

  it("keeps overview.md in overview group even when frontmatter type is source", async () => {
    useWikiStore.setState({
      project: { id: "demo-uuid", name: "Demo", path: "/projects/demo" },
      fileTree: [],
      selectedFile: null,
      activeTabPath: null,
    } as any)
    vi.mocked(listDirectory).mockImplementation(async (_projectId: string, dir?: string) => {
      if (dir === "wiki" || dir?.endsWith("/wiki")) {
        return [
          { name: "overview.md", relativePath: "wiki/overview.md", is_dir: false },
          {
            name: "sources",
            relativePath: "wiki/sources",
            is_dir: true,
            children: [
              { name: "from-source.md", relativePath: "wiki/sources/from-source.md", is_dir: false },
            ],
          },
        ]
      }
      return []
    })
    vi.mocked(readFile).mockImplementation(async (_projectId: string, relativePath: string) => {
      if (relativePath === "wiki/overview.md") {
        return "---\ntype: source\ntitle: 2023体检报告\n---\n"
      }
      return "---\ntype: source\ntitle: 来源页\n---\n"
    })

    render(<KnowledgeTree />)
    await screen.findByText("knowledgeTree.overview")
    expect(screen.getByText("knowledgeTree.sources")).toBeTruthy()
    expect(screen.getByText("2023体检报告")).toBeTruthy()
  })

  it("keeps /sources/ path in source group even when frontmatter type is concept", async () => {
    useWikiStore.setState({
      project: { id: "demo-uuid", name: "Demo", path: "/projects/demo" },
      fileTree: [],
      selectedFile: null,
      activeTabPath: null,
    } as any)
    vi.mocked(listDirectory).mockImplementation(async (_projectId: string, dir?: string) => {
      if (dir === "wiki" || dir?.endsWith("/wiki")) {
        return [
          {
            name: "sources",
            relativePath: "wiki/sources",
            is_dir: true,
            children: [
              { name: "x.md", relativePath: "wiki/sources/x.md", is_dir: false },
            ],
          },
        ]
      }
      return []
    })
    vi.mocked(readFile).mockResolvedValue("---\ntype: concept\ntitle: 来源写错类型\n---\n")

    render(<KnowledgeTree />)
    await screen.findByText("knowledgeTree.sources")
    expect(screen.getByText("x")).toBeTruthy()
  })

  it("uses filename as canonical label for concept/entity pages when frontmatter title drifts", async () => {
    useWikiStore.setState({
      project: { id: "demo-uuid", name: "Demo", path: "/projects/demo" },
      fileTree: [],
      selectedFile: null,
      activeTabPath: null,
    } as any)
    vi.mocked(listDirectory).mockImplementation(async (_projectId: string, dir?: string) => {
      if (dir === "wiki" || dir?.endsWith("/wiki")) {
        return [
          {
            name: "sources",
            relativePath: "wiki/sources",
            is_dir: true,
            children: [
              {
                name: "2023体检报告",
                relativePath: "wiki/sources/2023体检报告",
                is_dir: true,
                children: [
                  {
                    name: "concepts",
                    relativePath: "wiki/sources/2023体检报告/concepts",
                    is_dir: true,
                    children: [
                      {
                        name: "肥胖.md",
                        relativePath: "wiki/sources/2023体检报告/concepts/肥胖.md",
                        is_dir: false,
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ]
      }
      return []
    })
    vi.mocked(readFile).mockResolvedValue("---\ntype: concept\ntitle: 双肾结石\n---\n")

    render(<KnowledgeTree />)
    await screen.findByText("knowledgeTree.concepts")
    expect(screen.getByText("肥胖")).toBeTruthy()
    expect(screen.queryByText("双肾结石")).toBeNull()
  })

  it("shows stable overview label when overview.md is empty", async () => {
    useWikiStore.setState({
      project: { id: "demo-uuid", name: "Demo", path: "/projects/demo" },
      fileTree: [],
      selectedFile: null,
      activeTabPath: null,
    } as any)
    vi.mocked(listDirectory).mockImplementation(async (_projectId: string, dir?: string) => {
      if (dir === "wiki" || dir?.endsWith("/wiki")) {
        return [{ name: "overview.md", relativePath: "wiki/overview.md", is_dir: false }]
      }
      return []
    })
    vi.mocked(readFile).mockResolvedValue("")

    render(<KnowledgeTree />)
    await screen.findByText("knowledgeTree.overview")
    expect(screen.getByText("Wiki 总览")).toBeTruthy()
  })

  // ── T-001: Rename persists to frontmatter ──────────────────────────────────

  it("T-001: renaming a page calls writeFile with updated frontmatter title", async () => {
    useWikiStore.setState({
      project: { id: "demo-uuid", name: "Demo", path: "/projects/demo" },
      fileTree: [],
      selectedFile: null,
      activeTabPath: null,
    } as any)

    const originalContent = "---\ntype: concept\ntitle: Old Title\n---\n\n# Old Title\n"
    vi.mocked(listDirectory).mockImplementation(async (_projectId: string, dir?: string) => {
      if (dir === "wiki" || dir?.endsWith("/wiki")) {
        return [{
          name: "concepts",
          relativePath: "wiki/concepts",
          is_dir: true,
          children: [{ name: "my-page.md", relativePath: "wiki/concepts/my-page.md", is_dir: false }],
        }]
      }
      return []
    })
    vi.mocked(readFile).mockResolvedValue(originalContent)
    vi.mocked(writeFile).mockResolvedValue(undefined)

    render(<KnowledgeTree />)
    await screen.findByText("Old Title")

    // Right-click to open context menu
    const pageBtn = screen.getByText("Old Title").closest("button")!
    fireEvent.contextMenu(pageBtn)

    // Click rename
    await waitFor(() => screen.getByText("重命名"))
    fireEvent.click(screen.getByText("重命名"))

    // Find the rename input and submit new title
    await waitFor(() => screen.getByDisplayValue("Old Title"))
    const renameInput = screen.getByDisplayValue("Old Title")
    fireEvent.change(renameInput, { target: { value: "New Title" } })
    fireEvent.keyDown(renameInput, { key: "Enter" })

    // writeFile should have been called with updated frontmatter
    await waitFor(() => {
      expect(vi.mocked(writeFile)).toHaveBeenCalledWith(
        "demo-uuid",
        "wiki/concepts/my-page.md",
        expect.stringContaining("title: New Title"),
      )
    })
  })

  // ── T-002: Delete file ──────────────────────────────────────────────────────

  it("T-002: deleting a page calls deleteFile and removes it from the list", async () => {
    const { deleteFile } = await import("@/commands/fs")
    useWikiStore.setState({
      project: { id: "demo-uuid", name: "Demo", path: "/projects/demo" },
      fileTree: [],
      selectedFile: null,
      activeTabPath: null,
      openTabs: [],
      activeTabId: null,
    } as any)

    vi.mocked(listDirectory).mockImplementation(async (_projectId: string, dir?: string) => {
      if (dir === "wiki" || dir?.endsWith("/wiki")) {
        return [{
          name: "concepts",
          relativePath: "wiki/concepts",
          is_dir: true,
          children: [{ name: "deletable.md", relativePath: "wiki/concepts/deletable.md", is_dir: false }],
        }]
      }
      return []
    })
    vi.mocked(readFile).mockResolvedValue("---\ntype: concept\ntitle: Deletable Page\n---\n")
    vi.mocked(deleteFile).mockResolvedValue(undefined)

    render(<KnowledgeTree />)
    await screen.findByText("Deletable Page")

    const pageBtn = screen.getByText("Deletable Page").closest("button")!
    fireEvent.contextMenu(pageBtn)

    await waitFor(() => screen.getByText("删除"))
    fireEvent.click(screen.getByText("删除"))

    // Should call deleteFile
    await waitFor(() => {
      expect(vi.mocked(deleteFile)).toHaveBeenCalledWith(
        "demo-uuid",
        "wiki/concepts/deletable.md",
      )
    })

    // Page should be removed from the list
    await waitFor(() => {
      expect(screen.queryByText("Deletable Page")).not.toBeInTheDocument()
    })
  })
})
