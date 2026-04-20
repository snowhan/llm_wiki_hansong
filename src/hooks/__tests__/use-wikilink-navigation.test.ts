import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { useWikilinkNavigation } from "../use-wikilink-navigation"
import { useWikiStore } from "@/stores/wiki-store"

vi.mock("@/commands/fs", () => ({
  listDirectory: vi.fn(),
}))

import { listDirectory } from "@/commands/fs"
const mockListDirectory = vi.mocked(listDirectory)

const BASE_STATE = {
  project: null,
  fileTree: [],
  selectedFile: null,
  fileContent: "",
  chatExpanded: false,
  activeView: "wiki" as const,
  dataVersion: 0,
  openTabs: [],
  activeTabId: null,
  activeTabPath: null,
  ingestingPath: null,
  ingestStatuses: {} as Record<string, "idle" | "ingesting" | "interrupted" | "done" | "error">,
  serverTaskIds: {} as Record<string, string>,
  llmConfig: {
    provider: "openai" as const,
    apiKey: "",
    model: "",
    ollamaUrl: "http://localhost:11434",
    customEndpoint: "",
    maxContextSize: 204800,
  },
  searchApiConfig: { provider: "none" as const, apiKey: "" },
  embeddingConfig: { enabled: false, endpoint: "", apiKey: "", model: "" },
}

beforeEach(() => {
  useWikiStore.setState(BASE_STATE as any)
  mockListDirectory.mockReset()
})

describe("useWikilinkNavigation", () => {
  it("does nothing when no project is loaded", async () => {
    const openTab = vi.fn()
    const setActiveView = vi.fn()
    useWikiStore.setState({ project: null, fileTree: [], openTab, setActiveView } as any)

    const { result } = renderHook(() => useWikilinkNavigation())

    await act(async () => {
      await result.current("SomePage")
    })

    expect(openTab).not.toHaveBeenCalled()
    expect(mockListDirectory).not.toHaveBeenCalled()
  })

  it("opens a new tab via openTab when file is found in fileTree", async () => {
    const openTab = vi.fn()
    const setActiveView = vi.fn()

    useWikiStore.setState({
      project: { id: "proj1", name: "Test" } as any,
      fileTree: [
        {
          name: "wiki",
          is_dir: true,
          relativePath: "wiki",
          children: [
            {
              name: "concepts",
              is_dir: true,
              relativePath: "wiki/concepts",
              children: [
                {
                  name: "超重.md",
                  is_dir: false,
                  relativePath: "wiki/concepts/超重.md",
                  children: [],
                },
              ],
            },
          ],
        },
      ],
      openTab,
      setActiveView,
    } as any)

    const { result } = renderHook(() => useWikilinkNavigation())

    await act(async () => {
      await result.current("超重")
    })

    expect(openTab).toHaveBeenCalledWith("wiki/concepts/超重.md", "超重")
    expect(setActiveView).toHaveBeenCalledWith("wiki")
    expect(mockListDirectory).not.toHaveBeenCalled()
  })

  it("does not call listDirectory when file is already in fileTree", async () => {
    const openTab = vi.fn()
    const setActiveView = vi.fn()

    useWikiStore.setState({
      project: { id: "proj1", name: "Test" } as any,
      fileTree: [
        {
          name: "SomePage.md",
          is_dir: false,
          relativePath: "wiki/entities/SomePage.md",
          children: [],
        },
      ],
      openTab,
      setActiveView,
    } as any)

    const { result } = renderHook(() => useWikilinkNavigation())

    await act(async () => {
      await result.current("SomePage")
    })

    expect(mockListDirectory).not.toHaveBeenCalled()
    expect(openTab).toHaveBeenCalledWith("wiki/entities/SomePage.md", "SomePage")
  })

  it("falls back to listDirectory scan when file not in fileTree", async () => {
    const openTab = vi.fn()
    const setActiveView = vi.fn()

    mockListDirectory.mockResolvedValue([
      {
        name: "source1",
        is_dir: true,
        relativePath: "wiki/sources/source1",
        children: [
          {
            name: "entities",
            is_dir: true,
            relativePath: "wiki/sources/source1/entities",
            children: [
              {
                name: "SomePage.md",
                is_dir: false,
                relativePath: "wiki/sources/source1/entities/SomePage.md",
                children: [],
              },
            ],
          },
        ],
      },
    ] as any)

    useWikiStore.setState({
      project: { id: "proj1", name: "Test" } as any,
      fileTree: [],
      openTab,
      setActiveView,
    } as any)

    const { result } = renderHook(() => useWikilinkNavigation())

    await act(async () => {
      await result.current("SomePage")
    })

    expect(mockListDirectory).toHaveBeenCalledWith("proj1", "wiki/sources")
    expect(openTab).toHaveBeenCalledWith("wiki/sources/source1/entities/SomePage.md", "SomePage")
    expect(setActiveView).toHaveBeenCalledWith("wiki")
  })

  it("silently does nothing when file is not found anywhere", async () => {
    const openTab = vi.fn()
    mockListDirectory.mockResolvedValue([])

    useWikiStore.setState({
      project: { id: "proj1", name: "Test" } as any,
      fileTree: [],
      openTab,
    } as any)

    const { result } = renderHook(() => useWikilinkNavigation())

    await act(async () => {
      await result.current("NonExistent")
    })

    expect(openTab).not.toHaveBeenCalled()
  })

  it("silently handles listDirectory network error", async () => {
    const openTab = vi.fn()
    mockListDirectory.mockRejectedValue(new Error("network error"))

    useWikiStore.setState({
      project: { id: "proj1", name: "Test" } as any,
      fileTree: [],
      openTab,
    } as any)

    const { result } = renderHook(() => useWikilinkNavigation())

    await act(async () => {
      await expect(result.current("SomePage")).resolves.toBeUndefined()
    })

    expect(openTab).not.toHaveBeenCalled()
  })

  it("finds file nested deeply in fileTree", async () => {
    const openTab = vi.fn()
    const setActiveView = vi.fn()

    useWikiStore.setState({
      project: { id: "proj1", name: "Test" } as any,
      fileTree: [
        {
          name: "wiki",
          is_dir: true,
          relativePath: "wiki",
          children: [
            {
              name: "sources",
              is_dir: true,
              relativePath: "wiki/sources",
              children: [
                {
                  name: "2024体检报告",
                  is_dir: true,
                  relativePath: "wiki/sources/2024体检报告",
                  children: [
                    {
                      name: "entities",
                      is_dir: true,
                      relativePath: "wiki/sources/2024体检报告/entities",
                      children: [
                        {
                          name: "珠海奥乐医院.md",
                          is_dir: false,
                          relativePath: "wiki/sources/2024体检报告/entities/珠海奥乐医院.md",
                          children: [],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
      openTab,
      setActiveView,
    } as any)

    const { result } = renderHook(() => useWikilinkNavigation())

    await act(async () => {
      await result.current("珠海奥乐医院")
    })

    expect(openTab).toHaveBeenCalledWith(
      "wiki/sources/2024体检报告/entities/珠海奥乐医院.md",
      "珠海奥乐医院",
    )
    expect(setActiveView).toHaveBeenCalledWith("wiki")
  })
})
