import { describe, it, expect, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { FileTree } from "../layout/file-tree"
import { useWikiStore } from "@/stores/wiki-store"

beforeEach(() => {
  useWikiStore.setState({
    project: null,
    fileTree: [],
    selectedFile: null,
    fileContent: "",
    chatExpanded: false,
    activeView: "wiki",
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
})

describe("FileTree", () => {
  it("shows noProject message when there is no project", () => {
    render(<FileTree />)
    expect(screen.getByText("fileTree.noProject")).toBeTruthy()
  })

  it("renders folder and file nodes from fileTree", () => {
    useWikiStore.setState({
      project: { id: "wiki-uuid", name: "My Wiki", path: "/wiki" },
      fileTree: [
        {
          name: "docs",
          relativePath: "docs",
          is_dir: true,
          children: [{ name: "readme.md", relativePath: "docs/readme.md", is_dir: false }],
        },
        { name: "notes.md", relativePath: "notes.md", is_dir: false },
      ],
    } as any)
    render(<FileTree />)
    expect(screen.getByText("My Wiki")).toBeTruthy()
    expect(screen.getByText("folderNames.docs")).toBeTruthy()
    expect(screen.getByText("readme.md")).toBeTruthy()
    expect(screen.getByText("notes.md")).toBeTruthy()
  })

  it("calls setSelectedFile when a file is clicked", () => {
    useWikiStore.setState({
      project: { id: "p-uuid", name: "P", path: "/p" },
      fileTree: [{ name: "a.md", relativePath: "a.md", is_dir: false }],
    } as any)
    render(<FileTree />)
    fireEvent.click(screen.getByText("a.md"))
    expect(useWikiStore.getState().selectedFile).toBe("a.md")
  })

  it("uses activeTabPath (not stale selectedFile) for selected marker", () => {
    useWikiStore.setState({
      project: { id: "p-uuid", name: "P", path: "/p" },
      fileTree: [{ name: "a.md", relativePath: "a.md", is_dir: false }],
      selectedFile: "stale.md",
      activeTabPath: "a.md",
    } as any)
    render(<FileTree />)
    const btn = screen.getByText("a.md").closest("button")
    expect(btn?.getAttribute("aria-current")).toBe("page")
  })

  it("replay state: with two files, only activeTabPath is selected", () => {
    useWikiStore.setState({
      project: { id: "p-uuid", name: "P", path: "/p" },
      fileTree: [
        { name: "old.md", relativePath: "old.md", is_dir: false },
        { name: "new.md", relativePath: "new.md", is_dir: false },
      ],
      selectedFile: "old.md",
      activeTabPath: "new.md",
    } as any)
    render(<FileTree />)

    const oldBtn = screen.getByText("old.md").closest("button")
    const newBtn = screen.getByText("new.md").closest("button")
    expect(oldBtn?.getAttribute("aria-current")).toBeNull()
    expect(newBtn?.getAttribute("aria-current")).toBe("page")
  })

  it("toggles folder expand/collapse for children", () => {
    useWikiStore.setState({
      project: { id: "p-uuid", name: "P", path: "/p" },
      fileTree: [
        {
          name: "src",
          relativePath: "src",
          is_dir: true,
          children: [{ name: "main.ts", relativePath: "src/main.ts", is_dir: false }],
        },
      ],
    } as any)
    render(<FileTree />)
    expect(screen.getByText("main.ts")).toBeTruthy()
    fireEvent.click(screen.getByText("folderNames.src"))
    expect(screen.queryByText("main.ts")).toBeNull()
    fireEvent.click(screen.getByText("folderNames.src"))
    expect(screen.getByText("main.ts")).toBeTruthy()
  })
})
