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
})
