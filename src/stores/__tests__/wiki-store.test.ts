import { describe, it, expect, beforeEach } from "vitest"
import { useWikiStore } from "../wiki-store"

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
  })
})

describe("useWikiStore", () => {
  it("has correct initial state", () => {
    const state = useWikiStore.getState()
    expect(state.project).toBeNull()
    expect(state.fileTree).toEqual([])
    expect(state.activeView).toBe("wiki")
    expect(state.dataVersion).toBe(0)
  })

  it("setProject updates project", () => {
    useWikiStore.getState().setProject({ name: "Test", path: "/test" })
    expect(useWikiStore.getState().project).toEqual({ name: "Test", path: "/test" })
  })

  it("setProject can clear to null", () => {
    useWikiStore.getState().setProject({ name: "T", path: "/t" })
    useWikiStore.getState().setProject(null)
    expect(useWikiStore.getState().project).toBeNull()
  })

  it("setFileTree updates tree", () => {
    const tree = [{ name: "wiki", path: "/wiki", is_dir: true }]
    useWikiStore.getState().setFileTree(tree)
    expect(useWikiStore.getState().fileTree).toEqual(tree)
  })

  it("setSelectedFile updates selected", () => {
    useWikiStore.getState().setSelectedFile("/wiki/page.md")
    expect(useWikiStore.getState().selectedFile).toBe("/wiki/page.md")
  })

  it("setFileContent updates content", () => {
    useWikiStore.getState().setFileContent("# Hello")
    expect(useWikiStore.getState().fileContent).toBe("# Hello")
  })

  it("setChatExpanded toggles", () => {
    useWikiStore.getState().setChatExpanded(true)
    expect(useWikiStore.getState().chatExpanded).toBe(true)
  })

  it("setActiveView cycles through views", () => {
    const views = ["wiki", "sources", "search", "graph", "lint", "review", "settings"] as const
    for (const v of views) {
      useWikiStore.getState().setActiveView(v)
      expect(useWikiStore.getState().activeView).toBe(v)
    }
  })

  it("setLlmConfig updates LLM configuration", () => {
    const cfg = {
      provider: "anthropic" as const,
      apiKey: "sk-ant",
      model: "claude-3",
      ollamaUrl: "",
      customEndpoint: "",
      maxContextSize: 100000,
    }
    useWikiStore.getState().setLlmConfig(cfg)
    expect(useWikiStore.getState().llmConfig).toEqual(cfg)
  })

  it("setSearchApiConfig updates search config", () => {
    useWikiStore.getState().setSearchApiConfig({ provider: "tavily", apiKey: "tav" })
    expect(useWikiStore.getState().searchApiConfig.provider).toBe("tavily")
  })

  it("setEmbeddingConfig updates embedding config", () => {
    const cfg = { enabled: true, endpoint: "http://e", apiKey: "k", model: "m" }
    useWikiStore.getState().setEmbeddingConfig(cfg)
    expect(useWikiStore.getState().embeddingConfig).toEqual(cfg)
  })

  it("bumpDataVersion increments by 1", () => {
    expect(useWikiStore.getState().dataVersion).toBe(0)
    useWikiStore.getState().bumpDataVersion()
    expect(useWikiStore.getState().dataVersion).toBe(1)
    useWikiStore.getState().bumpDataVersion()
    expect(useWikiStore.getState().dataVersion).toBe(2)
  })
})
